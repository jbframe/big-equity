# Alpine base: minimal package set means a far smaller CVE surface than
# debian-slim. Pinned by digest for reproducible, tamper-evident builds;
# Dependabot bumps both the digest and the tag comment on new 3.12-alpine builds.
FROM python:3.14-alpine@sha256:26730869004e2b9c4b9ad09cab8625e81d256d1ce97e72df5520e806b1709f92

WORKDIR /app

# Dependencies first for better layer caching. (simulationV1 is stdlib-only
# today, but this keeps the image ready for when you add packages.)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# main.py imports its siblings (simulation, evaluation), which sit alongside it.
CMD ["python", "main.py"]
