from sqlalchemy import Column, Integer, String, Text, Float, ForeignKey, Index, DateTime
from sqlalchemy.orm import relationship
from .database import Base

class ModelConfig(Base):
    __tablename__ = "model_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    api_base_url = Column(String, nullable=False)
    type = Column(String, nullable=False)
    model_id = Column(String, nullable=True)
    headers = Column(Text, nullable=True)
    api_key = Column(Text, nullable=True)
    temperature = Column(Float, nullable=True)
    max_tokens = Column(Integer, nullable=True)
    source = Column(String, nullable=False, default="custom")
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)

class Chat(Base):
    __tablename__ = "chats"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)

    messages = relationship("Message", back_populates="chat", cascade="all,delete-orphan")

class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True)
    chat_id = Column(Integer, ForeignKey("chats.id"), nullable=False)
    role = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False)
    status = Column(String, nullable=False)
    error = Column(Text, nullable=False, default="")

    chat = relationship("Chat", back_populates="messages")

Index("idx_messages_chat_id", Message.chat_id, Message.created_at)

class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)
