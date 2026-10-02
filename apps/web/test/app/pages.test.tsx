import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AnchorLoading from "@/app/anchors/[domain]/loading";
import AnchorNotFound from "@/app/anchors/[domain]/not-found";
import AnchorPage, { generateMetadata } from "@/app/anchors/[domain]/page";
import ErrorPage from "@/app/error";
import RootLayout from "@/app/layout";
import Loading from "@/app/loading";
import NotFound from "@/app/not-found";
import HomePage from "@/app/page";
import { NOW, detail, mockFetch, mockMatchMedia, summary } from "../helpers/fixtures";

const API = "http://localhost:8080";
const params = (domain: string) => ({ params: Promise.resolve({ domain }) });

beforeEach(() => {
  // Only Date: real timers keep userEvent and React working.
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("/", () => {
  it("shows the anchor table with a health summary", async () => {
    mockFetch({
      [`${API}/v1/anchors`]: {
        body: [summary(), summary({ domain: "x.example", name: "X", reachable: false, score: 0 })],
      },
    });
    render(await HomePage());
    expect(screen.getByRole("heading", { name: "Anchors" })).toBeInTheDocument();
    expect(screen.getByText("2 monitored · 1 healthy · 0 degraded · 1 down")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("shows an empty state when there are no anchors", async () => {
    mockFetch({ [`${API}/v1/anchors`]: { body: [] } });
    render(await HomePage());
    expect(screen.getByText("No anchors yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("surfaces API failures to the error boundary", async () => {
    mockFetch({ [`${API}/v1/anchors`]: { status: 500 } });
    await expect(HomePage()).rejects.toThrow("The SEPscope API returned HTTP 500");
  });
});

describe("/anchors/[domain]", () => {
  it("shows the anchor's stats and a card per check", async () => {
    mockFetch({ [`${API}/v1/anchors/testanchor.stellar.org`]: { body: detail({ score: 75 }) } });
    render(await AnchorPage(params("testanchor.stellar.org")));
    expect(screen.getByRole("heading", { name: "Stellar Test Anchor" })).toBeInTheDocument();
    expect(screen.getByText("testanchor.stellar.org · testnet · Some checks failing")).toBeInTheDocument();
    const stats = screen.getByText("Score").closest("dl")!;
    expect(within(stats).getByText("75%")).toBeInTheDocument();
    expect(within(stats).getByText("99.4%")).toBeInTheDocument();
    expect(within(stats).getByText("5 min ago")).toHaveAttribute("datetime");
    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(screen.getByText("Missing Access-Control-Allow-Origin header")).toBeInTheDocument();
  });

  it("decodes the domain from the URL", async () => {
    const calls = mockFetch({ [`${API}/v1/anchors/a.example`]: { body: detail({ domain: "a.example" }) } });
    await AnchorPage(params("a%2Eexample"));
    expect(calls[0]!.url).toBe(`${API}/v1/anchors/a.example`);
    expect(await generateMetadata(params("a%2Eexample"))).toEqual({ title: "a.example" });
  });

  it("shows an empty state before the first run", async () => {
    mockFetch({
      [`${API}/v1/anchors/new.example`]: {
        body: detail({ checks: [], reachable: null, score: null, uptime24h: null, uptime7d: null, lastCheckedAt: null }),
      },
    });
    render(await AnchorPage(params("new.example")));
    expect(screen.getByText("Not checked yet", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("is a 404 for an unknown anchor", async () => {
    mockFetch({ [`${API}/v1/anchors/nope.example`]: { status: 404 } });
    await expect(AnchorPage(params("nope.example"))).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
  });
});

describe("loading, error and not-found states", () => {
  it("renders loading skeletons", () => {
    render(<Loading />);
    expect(screen.getByLabelText("Loading anchors")).toHaveAttribute("aria-busy", "true");
    render(<AnchorLoading />);
    expect(screen.getByLabelText("Loading anchor")).toBeInTheDocument();
  });

  it("shows the error and retries", async () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error("Could not reach the SEPscope API")} reset={reset} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not reach the SEPscope API");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("renders not-found pages with a way back", () => {
    render(<NotFound />);
    expect(screen.getByRole("link", { name: "Back to all anchors" })).toHaveAttribute("href", "/");
    render(<AnchorNotFound />);
    expect(screen.getByText("Anchor not found")).toBeInTheDocument();
  });
});

describe("layout", () => {
  it("sets the theme before paint and wraps pages in the header", () => {
    mockMatchMedia(false);
    const html = renderToStaticMarkup(
      <RootLayout>
        <p>page</p>
      </RootLayout>,
    );
    expect(html).toContain('<html lang="en">');
    expect(html).toMatch(/<script>\(\(\) => \{[\s\S]*dataset\.theme/);
    expect(html).toContain("SEPscope");
    expect(html).toContain("<p>page</p>");
  });
});
