function parallel(tasks, cb) {
    const results = [], to_complete = tasks.length;
    let completed = 0, failed = false;

    if (to_complete === 0) {
        process.nextTick(() => cb(null, results));
    } else {
        tasks.forEach((task, idx) => {
            task((err, result) => {
                if (failed) {
                    // do nothing
                } else if (err) {
                    failed = true;
                    cb(err);
                } else {
                    results[idx] = result;
                    if (++completed === to_complete) cb(null, results);
                }
            });
        });
    }
}

function serial(tasks, cb) {
    const results = [], t = [].concat(tasks);
    processTask();

    function processTask() {
        if (t.length === 0) cb(null, results);
        else t.shift()((err, result) => {
            if (err) cb(err);
            else {
                results.push(result);
                processTask();
            }
        });
    }
}

module.exports = {
    parallel: parallel,
    serial: serial
}
