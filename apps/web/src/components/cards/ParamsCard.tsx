interface ParamsCardProps {
  title?: string;
  items: Array<{ key: string; value: string }>;
}

export const ParamsCard = ({ title = 'Inputs', items }: ParamsCardProps) => {
  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-2 pr-4">Field</th>
              <th className="py-2">Value</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="py-2 pr-4 align-top text-muted-foreground" colSpan={2}>
                  No inputs
                </td>
              </tr>
            ) : (
              items.map((it, idx) => (
                <tr key={idx} className="border-b last:border-b-0">
                  <td className="py-2 pr-4 align-top font-medium text-foreground/90 whitespace-nowrap">
                    {it.key}
                  </td>
                  <td className="py-2 align-top text-foreground/90 break-words">
                    {it.value}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ParamsCard;

