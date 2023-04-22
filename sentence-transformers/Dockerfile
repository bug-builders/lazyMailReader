FROM nvidia/cuda:11.8.0-base-ubuntu22.04

RUN apt update && \
    apt install -y python3 && \
    apt install -y python3-pip && \
    rm -rf /var/lib/apt/lists

RUN pip install pipenv

WORKDIR /sentence-transformers

COPY Pipfile ./
COPY Pipfile.lock ./
COPY main.py ./

RUN pipenv install --deploy

RUN pipenv install gunicorn

ENV TRANSFORMERS_CACHE /sentence-transformers/model/

RUN pipenv run python main.py

EXPOSE 5000

ENTRYPOINT ["pipenv", "run", "gunicorn", "-t", "60", "--bind", "0.0.0.0:5000", "main:create_app()"]
