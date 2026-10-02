import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AnchorTable } from "@/components/AnchorTable";
import { NOW, minutesAgo, summary } from "../helpers/fixtures";

const anchors = [
  summary({ domain: "b.example", name: "Beta", score: 50, uptime24h: 87.5, lastCheckedAt: minutesAgo(30) }),
  summary({ domain: "a.example", name: "Alpha", network: "pubnet", score: 100, reachable: true }),
  summary({ domain: "c.example", name: "Gamma", reachable: null, score: null, uptime24h: null, lastCheckedAt: null }),
  summary({ domain: "d.example", name: "Delta", reachable: false, score: 0, uptime24h: 0 }),
];

/** Anchor names in display order. Each link holds the name, then the domain. */
const rowNames = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getByRole("link").querySelector(".font-medium")!.textContent);

describe("AnchorTable", () => {
  it("shows name, network, score, uptime, last check and a status dot per anchor", () => {
    render(<AnchorTable anchors={anchors} now={NOW} />);
    const beta = screen.getByRole("link", { name: /Beta/ }).closest("tr")!;
    expect(within(beta).getByText("b.example")).toBeInTheDocument();
    expect(within(beta).getByText("testnet")).toBeInTheDocument();
    expect(within(beta).getByText("50%")).toBeInTheDocument();
    expect(within(beta).getByText("87.5%")).toBeInTheDocument();
    expect(within(beta).getByText("30 min ago")).toHaveAttribute("datetime", minutesAgo(30));
    expect(within(beta).getByRole("img", { name: "Some checks failing" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Beta/ })).toHaveAttribute("href", "/anchors/b.example");

    const gamma = screen.getByRole("link", { name: /Gamma/ }).closest("tr")!;
    expect(within(gamma).getAllByText("—")).toHaveLength(2);
    expect(within(gamma).getByText("Never")).toBeInTheDocument();
    expect(within(gamma).getByRole("img", { name: "Not checked yet" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "stellar.toml unreachable" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "All checks passing" })).toBeInTheDocument();
  });

  it("sorts by name by default and toggles direction on a second click", async () => {
    render(<AnchorTable anchors={anchors} now={NOW} />);
    expect(rowNames()).toEqual(["Alpha", "Beta", "Delta", "Gamma"]);
    const header = screen.getByRole("columnheader", { name: /Anchor/ });
    expect(header).toHaveAttribute("aria-sort", "ascending");

    await userEvent.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(rowNames()).toEqual(["Gamma", "Delta", "Beta", "Alpha"]);
  });

  it("sorts a numeric column best first, with missing values last", async () => {
    render(<AnchorTable anchors={anchors} now={NOW} />);
    const score = screen.getByRole("columnheader", { name: /Score/ });
    await userEvent.click(within(score).getByRole("button"));
    expect(score).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByRole("columnheader", { name: /Anchor/ })).toHaveAttribute("aria-sort", "none");
    expect(rowNames()).toEqual(["Alpha", "Beta", "Delta", "Gamma"]);
    await userEvent.click(within(score).getByRole("button"));
    expect(rowNames()).toEqual(["Delta", "Beta", "Alpha", "Gamma"]);
  });
});
