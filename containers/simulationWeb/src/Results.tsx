import type { HoldemSimulationResult } from "./sim/holdem";
import type { SimulationResult } from "./sim/simulation";

const pct = (n: number, total: number): string =>
  total === 0 ? "0.00" : ((n / total) * 100).toFixed(2);

export function HoldemResults({ result }: { result: HoldemSimulationResult }) {
  const { simulations: sims, heroWins, villainWins, ties } = result;

  return (
    <section className="results">
      <h2>
        Hero equity: <strong>{result.heroEquity.toFixed(3)}%</strong>
      </h2>
      <p className="hint">{sims.toLocaleString()} simulations</p>

      <h3>Showdown</h3>
      <p>
        Hero wins {pct(heroWins, sims)}% · Villain wins {pct(villainWins, sims)}% · Ties{" "}
        {pct(ties, sims)}%
      </p>
    </section>
  );
}

export function Results({ result }: { result: SimulationResult }) {
  const { simulations: sims, high, low, scoop, noScoop } = result;
  const none = scoop.none;

  return (
    <section className="results">
      <h2>
        Hero equity: <strong>{result.heroEquity.toFixed(3)}%</strong>
      </h2>
      <p className="hint">{sims.toLocaleString()} simulations</p>

      <h3>High hand</h3>
      <p>
        Hero wins {pct(high.heroWins, sims)}% · Villain wins {pct(high.villainWins, sims)}% ·
        Splits {pct(high.splits, sims)}%
      </p>

      <h3>Low hand</h3>
      <p>
        No low {pct(low.noLow, sims)}% · Hero wins {pct(low.heroWins, sims)}% · Villain wins{" "}
        {pct(low.villainWins, sims)}% · Splits {pct(low.splits, sims)}%
      </p>

      <h3>Scoop</h3>
      <p>
        Hero scoops {pct(scoop.hero, sims)}% · Villain scoops {pct(scoop.villain, sims)}% · No
        scoop {pct(none, sims)}%
      </p>

      <h3>When nobody scoops</h3>
      <p>
        High — Hero wins {pct(noScoop.high.heroWins, none)}% · Villain wins{" "}
        {pct(noScoop.high.villainWins, none)}% · Splits {pct(noScoop.high.splits, none)}%
      </p>
      <p>
        Low — Hero wins {pct(noScoop.low.heroWins, none)}% · Villain wins{" "}
        {pct(noScoop.low.villainWins, none)}% · Splits {pct(noScoop.low.splits, none)}% · No low{" "}
        {pct(noScoop.low.noLow, none)}%
      </p>
    </section>
  );
}
