import os
import math
import torch
import logging
from flask import Flask, request
import time
import json
from sentence_transformers import SentenceTransformer, CrossEncoder

loading_question = 'What is the purpose of life?'
loading_sentence = "The purpose of life is subjective and determined by each individual. Some may believe the purpose of life is to seek knowledge and education, to find happiness and fulfillment, or to live with purpose by helping others."

ml_loading_question = 'Quel est le sens de la vie?'
ml_loading_sentence = "Le but de la vie est subjectif et déterminé par chaque individu. Certains peuvent croire que le but de la vie est de rechercher la connaissance et l éducation, de trouver le bonheur et l épanouissement, ou de vivre avec un objectif en aidant les autres."


def sigmoid(x):
    return 1 / (1 + math.exp(-x))

def import_embed_model():
    model = SentenceTransformer('sentence-transformers/all-mpnet-base-v2')
    model.encode(loading_sentence)
    return model


def import_cross_encode_model():
    model = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-4-v2')
    model.predict((
        loading_question,
        loading_sentence
    ))
    return model

def import_ml_cross_encode_model():
    model = CrossEncoder('nreimers/mmarco-mMiniLMv2-L6-H384-v1')
    model.predict((
        loading_question,
        loading_sentence
    ))
    return model


def embed(model, sentences):
    result = model.encode(sentences)
    return result.tolist()


def cross_encode(model, question, sentences):
    to_cross_encode = []
    for sentence in sentences:
        to_cross_encode.append((question, sentence))

    scores = model.predict(to_cross_encode)
    return list(map(lambda score: sigmoid(score), scores.tolist()))

def ml_cross_encode(model, question, sentences):
    to_cross_encode = []
    for sentence in sentences:
        to_cross_encode.append((question, sentence))

    scores = model.predict(to_cross_encode)
    return list(map(lambda score: sigmoid(score), scores.tolist()))


embed_model = import_embed_model()
cross_encode_model = import_cross_encode_model()
ml_cross_encode_model = import_ml_cross_encode_model()


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

        return embed(embed_model, sentences)

    @app.route("/cross_encode", methods=["POST"])
    def cross_encode_route():
        data = request.get_json()
        sentences = data["sentences"]
        question = data["question"]

        return cross_encode(cross_encode_model, question, sentences)

    @app.route("/ml_cross_encode", methods=["POST"])
    def ml_cross_encode_route():
        data = request.get_json()
        sentences = data["sentences"]
        question = data["question"]

        return ml_cross_encode(ml_cross_encode_model, question, sentences)

    return app


if __name__ == '__main__':
    print(embed(embed_model, [loading_sentence]))
    print(cross_encode(cross_encode_model, loading_question, [loading_sentence]))
    print(ml_cross_encode(ml_cross_encode_model, ml_loading_question, [ml_loading_sentence]))
