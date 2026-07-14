FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    g++ \
    cmake \
    && rm -rf /var/lib/apt/lists/*


COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY *.h ./
COPY bindings.cpp ./
COPY main.py ./

RUN g++ -O3 -Wall -shared -std=c++17 -fPIC \
    $(python3 -m pybind11 --includes) \
    bindings.cpp -o orderbook_cpp$(python3-config --extension-suffix)

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]