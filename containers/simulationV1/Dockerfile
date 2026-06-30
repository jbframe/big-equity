# Alpine base: minimal package set means a far smaller CVE surface than
# debian-slim. Pinned by digest for reproducible, tamper-evident builds;
# Dependabot bumps both the digest and the tag comment on new 3.12-alpine builds.
FROM python:3.12-alpine@sha256:6d43704baacd1bfbe7c295d7f13079d5d8104ed33568873133f8fc69980419df

WORKDIR /app

# Dependencies first for better layer caching. (simulationV1 is stdlib-only
# today, but this keeps the image ready for when you add packages.)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# main.py imports its siblings (simulation, evaluation), which sit alongside it.
CMD ["python", "main.py"]
