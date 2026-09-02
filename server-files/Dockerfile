FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Environment will be set via HF Secrets
ENV PYTHONUNBUFFERED=1

# Hugging Face Spaces use port 7860 by default
EXPOSE 7860

CMD ["python", "app.py"]
