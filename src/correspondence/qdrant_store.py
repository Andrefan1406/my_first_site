from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams


QDRANT_HOST = "localhost"
QDRANT_PORT = 6333

COLLECTION_NAME = "correspondence"
VECTOR_SIZE = 768


client = QdrantClient(
    host=QDRANT_HOST,
    port=QDRANT_PORT,
)


def create_collection() -> None:
    collections = client.get_collections().collections
    collection_names = [collection.name for collection in collections]

    if COLLECTION_NAME in collection_names:
        print(f"Коллекция '{COLLECTION_NAME}' уже существует")
        return

    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(
            size=VECTOR_SIZE,
            distance=Distance.COSINE,
        ),
    )

    print(f"Коллекция '{COLLECTION_NAME}' создана")