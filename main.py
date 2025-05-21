from flask import Flask, request
from blog_generator import BlogGenerator
from validator import validate_blog_schema
from DB import get_database
import json

app = Flask(__name__)

@app.route("/")
def welcome():
    return "Welcome to the Blog Generator API!"

@app.route("/generate_blog")
def generate_blog():
    topic = request.args.get('topic', '')
    
    if topic == '':
        return "Topic is required"
    
    blog_generator = BlogGenerator()
    blog = blog_generator.generate_blog(topic)
    try:
        blog_dict = json.loads(blog)
    except json.JSONDecodeError:
        return "Invalid JSON format"
    
    isValidated = validate_blog_schema(blog_dict)
    if isValidated:
        DB = get_database()
        DB.insert_one(blog_dict)
        return "Blog has been validated and saved to the database"
    else:
        return "Blog schema is invalid"

@app.route("/get_blogs")
def get_blogs():
    DB = get_database()
    blogs = DB.find()
    return json.dumps(list(blogs))

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)