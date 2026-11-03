export function generationHistoryRecord(task, url) {
    const type = task.type || 'image';
    const requestId = task.request_id || null;
    const id = type === 'video' ? encodeURIComponent(requestId || task.id) : task.id;
    if (!id || id === 'undefined' || !url) throw new Error('Resultado incompleto.');
    return {
        id,
        data: {
            ...(task.settings || {}),
            url,
            prompt: task.prompt || (type === 'video' ? 'Vídeo generado' : 'Imagen generada'),
            model: task.settings?.model || task.endpoint || type,
            type,
            request_id: requestId,
            ...(type === 'video' ? { muapi_request_id: requestId } : {}),
        },
    };
}

export function recentVideoHistory(entries) {
    const rows = new Map();
    for (const entry of entries) {
        if (entry.type !== 'video' || !entry.url) continue;
        rows.set(entry.request_id || entry.muapi_request_id || entry.id, entry);
    }
    const millis = value => value?.toMillis?.() || Number(value?.seconds || 0) * 1000 || Date.parse(value) || 0;
    return [...rows.values()].sort((a, b) => millis(b.createdAt) - millis(a.createdAt)).slice(0, 20);
}
