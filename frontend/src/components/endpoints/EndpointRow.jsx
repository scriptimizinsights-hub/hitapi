
import { CheckSquare, Square, Eye, Trash2 } from 'lucide-react';


export function EndpointRow({
    endpoint,
    selected,
    onSelect,
    onCheck,
    checked,
    onView,
    onDelete
}) {
    const method = endpoint.method;

    const paramCount = (() => {
        try {
            return JSON.parse(endpoint.parameters || '[]').length;
        } catch {
            return 0;
        }
    })();

    const tags = (() => {
        try {
            return JSON.parse(endpoint.tags || '[]');
        } catch {
            return [];
        }
    })();

    return (
        <tr
            onClick={() => onSelect(endpoint)}
            style={{
                cursor: 'pointer',
                background: selected
                    ? 'rgba(130,100,255,0.05)'
                    : 'transparent'
            }}
        >
            {/* Checkbox */}
            <td
                onClick={e => {
                    e.stopPropagation();
                    onCheck(endpoint.id);
                }}
                style={{
                    width: 36,
                    cursor: 'pointer'
                }}
            >
                {checked
                    ? <CheckSquare size={15} color="var(--accent)" />
                    : <Square size={15} color="var(--text-tertiary)" />}
            </td>

            {/* Method */}
            <td>
                <span className={`method-badge method-${method}`}>
                    {method}
                </span>
            </td>

            {/* Path */}
            <td>
                <span
                    style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 12
                    }}
                >
                    {endpoint.path}
                </span>
            </td>

            {/* Summary */}
            <td
                style={{
                    color: 'var(--text-secondary)',
                    fontSize: 12
                }}
            >
                {endpoint.summary || '—'}
            </td>

            {/* Tags */}
            <td>
                {tags.map(tag => (
                    <span
                        key={tag}
                        className="badge badge-gray"
                        style={{
                            marginRight: 4,
                            fontSize: 10
                        }}
                    >
                        {tag}
                    </span>
                ))}
            </td>

            {/* Params */}
            <td
                style={{
                    color: 'var(--text-tertiary)',
                    fontSize: 12
                }}
            >
                {paramCount} params
            </td>

            {/* Actions */}
            <td
                onClick={e => e.stopPropagation()}
                style={{
                    width: 90
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 4
                    }}
                >
                    <button
                        type="button"
                        title="View endpoint"
                        onClick={e => {
                            e.stopPropagation();
                            onView(endpoint);
                        }}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--text-tertiary)',
                            cursor: 'pointer',
                            padding: 5,
                            display: 'flex',
                            alignItems: 'center',
                            borderRadius: 5
                        }}
                    >
                        <Eye size={15} />
                    </button>

                    <button
                        type="button"
                        title="Delete endpoint"
                        onClick={e => {
                            e.stopPropagation();
                            onDelete(endpoint);
                        }}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--text-tertiary)',
                            cursor: 'pointer',
                            padding: 5,
                            display: 'flex',
                            alignItems: 'center',
                            borderRadius: 5
                        }}
                    >
                        <Trash2 size={15} />
                    </button>
                </div>
            </td>
        </tr>
    );
}