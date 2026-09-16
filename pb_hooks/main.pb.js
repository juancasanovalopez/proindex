function deleteExpiredVisitors() {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const visitors = $app.findRecordsByFilter(
        'visitors',
        'created < {:cutoff}',
        '-created',
        200,
        0,
        { cutoff }
    );

    for (const visitor of visitors) {
        $app.delete(visitor);
    }
}

cronAdd('cleanup-visitors', '@daily', deleteExpiredVisitors);

onRecordCreateRequest((e) => {
    const requestInfo = e.requestInfo();
    e.record.set('ip', e.realIP());
    e.record.set('userAgent', requestInfo.headers.user_agent || '');
    e.record.set('referer', requestInfo.headers.referer || '');
    e.record.set('acceptLanguage', requestInfo.headers.accept_language || '');
    e.next();
});
