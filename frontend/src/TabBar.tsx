export type AppTab = 'chart' | 'fundamentals' | 'portfolio';

const TABS: { id: AppTab; label: string }[] = [
    { id: 'chart',        label: 'Chart'        },
    { id: 'fundamentals', label: 'Fundamentals' },
    { id: 'portfolio',    label: 'Portfolio'    },
];

type Props = {
    activeTab: AppTab;
    onChange: (tab: AppTab) => void;
};

export function TabBar({ activeTab, onChange }: Props) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 2,
            padding: '0 16px',
            background: '#0d0d0d',
            borderBottom: '1px solid #2a2a2a',
            flexShrink: 0,
        }}>
            {TABS.map(tab => (
                <button
                    key={tab.id}
                    onClick={() => onChange(tab.id)}
                    style={{
                        padding: '8px 18px',
                        background: activeTab === tab.id ? '#141414' : 'transparent',
                        color: activeTab === tab.id ? '#e2e8f0' : '#64748b',
                        border: 'none',
                        borderTop: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
                        borderBottom: activeTab === tab.id ? '1px solid #141414' : '1px solid transparent',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontFamily: 'Arial, sans-serif',
                        fontWeight: activeTab === tab.id ? 600 : 400,
                        marginBottom: -1,
                        transition: 'color 0.15s',
                    }}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}
