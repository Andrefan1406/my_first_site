from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Document:
    id: str
    document_type: str  # incoming_letter, outgoing_letter, order, contract
    title: Optional[str]
    number: Optional[str]
    date: Optional[str]
    sender: Optional[str]
    recipient: Optional[str]
    text: str
    file_path: str
    metadata: dict = field(default_factory=dict)


@dataclass
class DocumentChunk:
    id: str
    document_id: str
    chunk_index: int
    text: str
    metadata: dict = field(default_factory=dict)