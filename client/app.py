import os
from flask import Flask, render_template

PUBLIC_URL = os.environ.get("PUBLIC_URL", "http://localhost:8080")

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html", auth_origin=PUBLIC_URL)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
