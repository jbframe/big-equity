Prerequisites:
1/ miniconda package manager is installed on an osx-arm64 or standard linux computer

Steps to run:
1/ In a terminal navigate to the big-equity project directory
2/ Execute $ conda env create --name be -f be.yml
3/ Execute $ conda activate be

Steps to update env:
1/ Execute $ conda env update --name be -f be.yml

Running locally:
simulationV1 is stdlib-only, so you can run it directly:

    cd containers/simulationV1
    python main.py

Or via Docker, exactly as it runs in production:

    docker build -t simulationv1 containers/simulationV1
    docker run --rm simulationv1