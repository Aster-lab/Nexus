"""Null-only contract until the risk service has an approved explanation producer."""

from types import NoneType

from pydantic import TypeAdapter


PredictionRecordExplanationAdapter = TypeAdapter(NoneType)
