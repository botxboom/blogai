from langchain_core.prompts import ChatPromptTemplate
from langchain_ollama.llms import OllamaLLM

class BlogGenerator:
    _instance = None  # Singleton instance

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(BlogGenerator, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True

        # Define the prompt template
        self.template = """
        Topic: {topic}

        Blog:
        Let's write a detailed and engaging blog step by step. Here's the structure:

        1. **Title**: Start with an engaging title for the blog.
        2. **Introduction**: Provide a brief introduction to the topic to hook the reader.
        3. **Main Content**:
           - Break the topic into sections with **headings**.
           - Add detailed explanations under each heading.
           - Include **subheadings** where necessary to organize the content further.
        4. **Engagement Elements**:
           - Add **emojis** to make the content engaging.
           - Include **fun facts** to grab attention and make it enjoyable.
        5. **Conclusion**: Summarize the blog with key takeaways or a call to action.
        
        
        Important Point:
        * Make sure the blog is informative, engaging, and well-structured.
        * Don't forget to proofread and edit the blog for clarity and coherence.
        * Do not append or prepend any text to the final output except for the JSON format.
        

        Output Format: The blog must be in **JSON format** as shown below nothing else should be appended or prepended to the output.:
          {{
            "title": "<title>",
            "sections": [
              {{
                "heading": "<heading>",
                "content": "<content>",
                "subheadings": [
                  {{
                    "subheading": "<subheading>",
                    "content": "<content>"
                  }}
                ]
              }}
            ],
            "conclusion": "<summary or call to action>"
          }}
        """

        # Initialize the prompt and model
        self.prompt = ChatPromptTemplate.from_template(self.template)
        self.model = OllamaLLM(model="llama3.2")
        self.chain = self.prompt | self.model

    def generate_blog(self, topic):
        """Generates a blog for the given topic."""
        return self.chain.invoke({"topic": topic})
