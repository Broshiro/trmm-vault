FROM python:3.12-slim

# Install Bitwarden CLI
RUN apt-get update && apt-get install -y curl unzip && \
    curl -sL "https://vault.bitwarden.com/download/?app=cli&platform=linux" -o /tmp/bw.zip && \
    unzip /tmp/bw.zip -d /usr/local/bin/ && \
    chmod +x /usr/local/bin/bw && \
    rm /tmp/bw.zip && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 8200
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8200"]
