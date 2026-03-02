"""RAG engine — parameterized per-project (no module globals)."""

import os
from pathlib import Path

import anthropic
import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
from llama_index.core import VectorStoreIndex, Settings, StorageContext, SimpleDirectoryReader
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from dotenv import load_dotenv

load_dotenv()

PROJECTS_DIR = Path(__file__).parent.parent.parent / "projects"

# Shared singleton clients
_anthropic_client = None
_embedding_function = None


def _get_anthropic_client():
    global _anthropic_client
    if _anthropic_client is None:
        _anthropic_client = anthropic.Anthropic()
    return _anthropic_client


def _get_embedding_function():
    global _embedding_function
    if _embedding_function is None:
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
    db_path = _project_db_path(project_id)
    os.makedirs(db_path, exist_ok=True)
    client = chromadb.PersistentClient(path=db_path)
    return client.get_or_create_collection(
        collection_name, embedding_function=_get_embedding_function()
    )


def rephrase_as_query(question: str) -> str:
    """Use Claude to rephrase a question into a concise vector DB query."""
    client = _get_anthropic_client()
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=50,
        messages=[
            {
                "role": "user",
                "content": f"Rewrite the following question as a concise 2 word query for a vector database: {question}",
            }
        ],
    )
    return message.content[0].text


def query_rag(project_id: str, collection_name: str, prompt_template: str, question: str) -> str:
    """Query the RAG pipeline: retrieve context, then generate answer with Claude."""
    collection = _get_collection(project_id, collection_name)
    client = _get_anthropic_client()

    # Check if collection has documents
    if collection.count() == 0:
        return "No documents loaded in the knowledge base. Please upload documents first."

    results = collection.query(
        query_texts=[rephrase_as_query(question)], n_results=5
    )

    concatenated_docs = "\n\n".join(results["documents"][0])

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": prompt_template.format(
                    context=concatenated_docs, question=question
                ),
            },
        ],
    )
    return message.content[0].text


def load_data(project_id: str, collection_name: str) -> int:
    """Load documents from project's data directory into ChromaDB. Returns doc count."""
    Settings.embed_model = HuggingFaceEmbedding(model_name="all-MiniLM-L6-v2")

    data_path = _project_data_path(project_id)
    if not os.path.exists(data_path):
        raise FileNotFoundError(f"No data directory for project {project_id}")

    reader = SimpleDirectoryReader(
        input_dir=data_path,
        required_exts=[".md", ".txt", ".pdf"],
        recursive=True,
    )
    docs = reader.load_data()

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
    db_path = _project_db_path(project_id)
    if os.path.exists(db_path):
        client = chromadb.PersistentClient(path=db_path)
        try:
            client.delete_collection(collection_name)
        except Exception:
            pass
