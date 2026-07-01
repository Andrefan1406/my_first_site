from uuid import uuid4
from .models import Document, DocumentChunk


def split_text(text: str, chunk_size: int = 1000, overlap: int = 150) -> list[str]:
    chunks = []
    start = 0

    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        start += chunk_size - overlap

    return chunks


def create_chunks(document: Document) -> list[DocumentChunk]:
    text_chunks = split_text(document.text)

    return [
        DocumentChunk(
            id=str(uuid4()),
            document_id=document.id,
            chunk_index=index,
            text=chunk_text,
            metadata={
                "document_type": document.document_type,
                "title": document.title,
                "number": document.number,
                "date": document.date,
                "sender": document.sender,
                "recipient": document.recipient,
                "file_path": document.file_path,
            },
        )
        for index, chunk_text in enumerate(text_chunks)
    ]