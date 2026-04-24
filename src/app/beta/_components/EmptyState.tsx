type Props = {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
};

export default function EmptyState({ title, description, action, icon }: Props) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-4">
      {icon ? <div className="mb-4 text-[var(--accent)]">{icon}</div> : null}
      <h3 className="text-lg font-semibold text-[var(--foreground)]">{title}</h3>
      {description ? <p className="mt-2 text-sm text-[var(--text-muted)] max-w-[280px]">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
