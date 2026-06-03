FROM pytorch/pytorch:2.7.0-cuda12.8-cudnn9-runtime

WORKDIR /app

RUN pip install --no-cache-dir \
    fastapi[standard]==0.116.0 \
    uvicorn[standard]==0.34.3 \
    sqlalchemy[asyncio]==2.0.41 \
    asyncpg==0.30.0 \
    pgvector==0.3.6 \
    sentence-transformers==4.1.0 \
    pydantic==2.11.4 \
    numpy==2.3.0 \
    prometheus-fastapi-instrumentator==7.1.0

COPY app/ /app/app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
