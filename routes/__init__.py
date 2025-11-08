# Routes package initialization
from flask import Blueprint

# Import blueprints
from .friends import friends_bp
from .servers import servers_bp

# Export blueprints
__all__ = ['friends_bp', 'servers_bp']
