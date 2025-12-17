import os
import json
import frontmatter
import markdown
from datetime import datetime

CONTENT_DIR = 'content'
OUTPUT_DIR = 'posts'
TEMPLATE_FILE = 'templates/post_layout.html'
JSON_DB = 'data/notes.json'

def bake():
    with open(TEMPLATE_FILE, 'r', encoding='utf-8') as f:
        template = f.read()
    posts_metadata = []

    for filename in os.listdir(CONTENT_DIR):
        if filename.endswith('.md'):
            filepath = os.path.join(CONTENT_DIR, filename)

            with open(filepath, 'r', encoding='utf-8') as f:
                post = frontmatter.load(f)
            
            html_content = markdown.markdown(post.content, extensions=['fenced_code', 'tables'])
            title = post.get('title', 'Untitled Unit')
            date = post.get('date', 'UNKNOWN')
            tags = post.get('tags', [])

            output_filename = filename.replace('.md', '.html')
            output_path = os.path.join(OUTPUT_DIR, output_filename)

            final_html = template.replace('{{ title }}', title)
            final_html = final_html.replace('{{ date }}', str(date))
            final_html = final_html.replace('{{ tags }}', ' / '.join(tags).upper())
            final_html = final_html.replace('{{ content }}', html_content)

            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(final_html)

            print(f"Compiled: {output_filename}")

            posts_metadata.append({
                "title": title,
                "date": str(date),
                "url": f"posts/{output_filename}",
                "tags": tags
            })
    posts_metadata.sort(key=lambda x: x['date'], reverse=True)

    with open(JSON_DB, 'w', encoding='utf-8') as f:
        json.dump(posts_metadata, f, indent=4)
    
    print("Database updated.")

if __name__ == "__main__":
    bake()