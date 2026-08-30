import { useEffect, useState } from "react";
import { fetchPortfolioHoldings } from "./services/portfolioApi";
import { NewsFeedPanel } from "./NewsFeedPanel";

export function PortfolioNewsPanel() {
    const [symbols, setSymbols] = useState<string[]>([]);

    useEffect(() => {
        fetchPortfolioHoldings()
            .then(holdings => {
                const unique = Array.from(new Set(holdings.map(h => h.tickerSymbol)));
                setSymbols(unique);
            })
            .catch(() => setSymbols([]));
    }, []);

    return <NewsFeedPanel title="Portfolio News" symbols={symbols} />;
}
