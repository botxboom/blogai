from pymongo import MongoClient
from dotenv import load_dotenv
import os

load_dotenv()


uri = os.getenv("MONGO_URI")
client = MongoClient(uri)

def get_database():
    MONGO_DB = client.get_database("blogai")
    BLOGS_DB = MONGO_DB.get_collection("blogs")
    return BLOGS_DB