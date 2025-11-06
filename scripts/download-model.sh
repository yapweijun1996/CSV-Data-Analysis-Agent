#!/usr/bin/env bash
set -euo pipefail
MODEL_ID="Xenova/all-MiniLM-L6-v2"
TARGET_DIR="public/models/${MODEL_ID}"
PARTS=(
  "config.json"
  "tokenizer.json"
  "tokenizer_config.json"
  "special_tokens_map.json"
  "vocab.txt"
  "onnx/model.onnx"
  "onnx/model_bnb4.onnx"
  "onnx/model_fp16.onnx"
  "onnx/model_int8.onnx"
  "onnx/model_q4.onnx"
  "onnx/model_q4f16.onnx"
  "onnx/model_quantized.onnx"
  "onnx/model_uint8.onnx"
)

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required but not installed." >&2
  exit 1
fi

mkdir -p "${TARGET_DIR}/onnx"

for part in "${PARTS[@]}"; do
  out_path="${TARGET_DIR}/${part}"
  mkdir -p "$(dirname "${out_path}")"
  echo "Downloading ${MODEL_ID}/${part}..."
  curl -L -f "https://huggingface.co/${MODEL_ID}/resolve/main/${part}" \
    -o "${out_path}"
done

echo "Model assets downloaded to ${TARGET_DIR}"
