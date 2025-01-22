from pydantic import BaseModel, ValidationError
from typing import List, Optional

class BlogSection(BaseModel):
    heading: str
    content: str
    subheadings: Optional[List[dict]] = []  # Default to an empty list if no subheadings are provided

class BlogSchema(BaseModel):
    title: str
    sections: Optional[List[BlogSection]] = []  # Default to an empty list if no sections are provided
    conclusion: str

def validate_blog_schema(data: dict):
    try:
        BlogSchema(**data)
        return True
    except ValidationError as e:
        print(e)
        return False