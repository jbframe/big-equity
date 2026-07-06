# simulationPY

The original poker equity simulator — a Monte Carlo simulator for **5-card
Omaha Hi-Lo (8-or-better)**. Given hero/villain hands and a board, it runs out
the remaining cards and reports each player's equity. Stdlib-only Python
(`random`, `itertools`); `requirements.txt` intentionally declares no
dependencies.
`simulationTS` is a faithful TypeScript port of this code.

## Prerequisites

- Python 3 (the container runs 3.14)

## Run

Directly:

```sh
cd containers/simulationPY
python main.py     # runs the example matchups in main.py
```

Or via Docker, exactly as it runs in production:

```sh
docker build -t simulationpy containers/simulationPY
docker run --rm simulationpy
```

## Layout

| File            | Responsibility                                       |
| --------------- | ---------------------------------------------------- |
| `evaluation.py` | 5-card high/low hand scoring and winner comparison   |
| `simulation.py` | Monte Carlo loop (`simulate_board`), equity math     |
| `main.py`       | Example matchups (entry point)                       |

## Conda environment (optional)

`be.yml` defines a conda env with analysis extras (numpy, pandas, matplotlib,
rlcard, bettermdptools) that the simulator itself does not need:

```sh
conda env create --name be -f be.yml    # create
conda activate be
conda env update --name be -f be.yml    # update after editing be.yml
```

## Deployment

Ships through the standard pipeline: `deploy.yml` auto-discovers the
`Dockerfile`, builds the image, pushes to GHCR, and runs `docker compose up -d`
on the box. It's a **batch job** — it runs to completion and exits
(`restart: "no"` in `docker-compose.yml`), publishes no ports, and is not
reachable from the internet.
