FROM python:3.12-slim

WORKDIR /app

# Dependencies first for better layer caching. (simulationV1 is stdlib-only
# today, but this keeps the image ready for when you add packages.)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# main.py imports its siblings (simulation, evaluation), which sit alongside it.
CMD ["python", "main.py"]
