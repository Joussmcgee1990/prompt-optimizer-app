"""RAG engine — parameterized per-project (no module globals).

Uses Sonnet 4.6 for query rephrasing, Opus 4.6 for RAG answer generation.
"""

import os
from pathlib import Path

_DATA_DIR = Path(os.environ.get("DATA_DIR", str(Path(__file__).parent.parent.parent)))
PROJECTS_DIR = _DATA_DIR / "projects"

# Shared singleton clients
_anthropic_client = None
_embedding_function = None


def _get_anthropic_client():
    global _anthropic_client
    if _anthropic_client is None:
        import anthropic
        from dotenv import load_dotenv
        load_dotenv(override=True)
        _anthropic_client = anthropic.Anthropic()
    return _anthropic_client


def _get_embedding_function():
    global _embedding_function
    if _embedding_function is None:
        from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
        _embedding_function = SentenceTransformerEmbeddingFunction(
            model_name="all-MiniLM-L6-v2"
        )
    return _embedding_function


def _project_db_path(project_id: str) -> str:
    return str(PROJECTS_DIR / project_id / "db" / "chroma_data")


def _project_data_path(project_id: str) -> str:
    return str(PROJECTS_DIR / project_id / "data")


def _get_collection(project_id: str, collection_name: str):
    """Get or create a ChromaDB collection for a project."""
    import chromadb
    db_path = _project_db_path(project_id)
    os.makedirs(db_path, exist_ok=True)
    client = chromadb.PersistentClient(path=db_path)
    return client.get_or_create_collection(
        collection_name, embedding_function=_get_embedding_function()
    )


_rephrase_cache: dict[str, str] = {}


def rephrase_as_query(question: str) -> str:
    """Use Claude Sonnet to rephrase a question into a concise vector DB query.

    Results are cached per question to ensure deterministic RAG retrieval —
    same question always gets the same search query → same context → consistent scoring.
    """
    if question in _rephrase_cache:
        return _rephrase_cache[question]

    from .models import MODEL_GENERATE
    client = _get_anthropic_client()
    message = client.messages.create(
        model=MODEL_GENERATE,
        max_tokens=50,
        messages=[
            {
                "role": "user",
                "content": f"Rewrite the following question as a concise 2 word query for a vector database: {question}",
            }
        ],
    )
    result = message.content[0].text
    _rephrase_cache[question] = result
    return result


def query_rag(project_id: str, collection_name: str, prompt_template: str, question: str) -> str:
    """Query the RAG pipeline: retrieve context, then generate answer with Claude."""
    collection = _get_collection(project_id, collection_name)
    client = _get_anthropic_client()

    # Check if collection has documents
    if collection.count() == 0:
        return "No documents loaded in the knowledge base. Please upload documents first."

    from .models import MODEL_RAG_ANSWER

    results = collection.query(
        query_texts=[rephrase_as_query(question)], n_results=5
    )

    concatenated_docs = "\n\n".join(results["documents"][0])

    message = client.messages.create(
        model=MODEL_RAG_ANSWER,
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": prompt_template.replace("{context}", concatenated_docs).replace("{question}", question),
            },
        ],
    )
    return message.content[0].text


def load_data(project_id: str, collection_name: str) -> int:
    """Load documents from project's data directory AND KB files from DB into ChromaDB. Returns doc count."""
    from .. import database as db

    from llama_index.core import VectorStoreIndex, Settings, StorageContext, SimpleDirectoryReader, Document
    from llama_index.vector_stores.chroma import ChromaVectorStore
    from llama_index.embeddings.huggingface import HuggingFaceEmbedding

    Settings.embed_model = HuggingFaceEmbedding(model_name="all-MiniLM-L6-v2")

    docs = []

    # 1. Load filesystem documents (uploaded files)
    data_path = _project_data_path(project_id)
    if os.path.exists(data_path):
        try:
            reader = SimpleDirectoryReader(
                input_dir=data_path,
                required_exts=[".md", ".txt", ".pdf"],
                recursive=True,
            )
            docs.extend(reader.load_data())
        except ValueError:
            pass  # No files matching extensions

    # 2. Load KB files from database
    kb_files = db.get_all_kb_file_contents(project_id)
    for kf in kb_files:
        if kf["content"].strip():
            docs.append(Document(
                text=kf["content"],
                metadata={"filename": kf["filename"], "source": "knowledge_base"},
            ))

    if not docs:
        return 0

    collection = _get_collection(project_id, collection_name)
    vector_store = ChromaVectorStore(chroma_collection=collection)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)
    index = VectorStoreIndex.from_documents(docs, storage_context=storage_context)
    index.storage_context.persist()

    return len(docs)


def clear_collection(project_id: str, collection_name: str):
    """Delete and recreate a project's collection."""
    import chromadb
    db_path = _project_db_path(project_id)
    if os.path.exists(db_path):
        client = chromadb.PersistentClient(path=db_path)
        try:
            client.delete_collection(collection_name)
        except Exception:
            pass
