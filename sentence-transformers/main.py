import os
import torch
import logging
from flask import Flask, request
import time
import json
from sentence_transformers import SentenceTransformer

def import_model():
    model = SentenceTransformer('sentence-transformers/all-mpnet-base-v2')
    model.encode(['What is the purpose of life?'])
    return model


def run(model, sentences):
    result = model.encode(sentences)
    return result.tolist()

embed_model = import_model()

def return_device_usage():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if device.type == "cuda":
        memory_allocated = round(torch.cuda.memory_allocated(0) / 1024**3, 1)
        memory_reserved = round(torch.cuda.memory_reserved(0) / 1024**3, 1)
        return {
            'is_using_gpu': True,
            'memory_allocated': memory_allocated,
            'memory_reserved': memory_reserved
        }
    else:
        return {
            'is_using_gpu': False,
            'memory_allocated': -1,
            'memory_reserved': -1
        }


def print_info(logger):
    device_usage = return_device_usage()
    if device_usage['is_using_gpu']:
        logger.info(torch.cuda.get_device_name(0))
        logger.info("Memory Usage:")
        logger.info("Allocated: %fGB" % device_usage['memory_allocated'])
        logger.info("Cached:    %fGB" % device_usage['memory_reserved'])
    else:
        logger.info('Not using GPU')

def create_app():
    app = Flask(__name__)

    if __name__ != '__main__':
        gunicorn_logger = logging.getLogger('gunicorn.error')
        app.logger.handlers = gunicorn_logger.handlers
        app.logger.setLevel(gunicorn_logger.level)

    print_info(app.logger)

    @app.errorhandler(Exception)
    def handle_exception(e):
        app.logger.critical(e)
        return {'error': True}, 500

    @app.route("/embed", methods=["POST"])
    def embed_route():
        data = request.get_json()
        sentences = data["sentences"]

        return run(embed_model, sentences)
    return app


if __name__ == '__main__':
    print(embed_model)
