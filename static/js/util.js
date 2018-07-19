const util = (function () {
    function clearForm(form) {
        if (typeof form === 'string') form = document.querySelector(`#${form}`);

        for (let i = 0; i < form.length; i++) {
            if (form[i].tagName === "INPUT") form[i].value = '';
        }
    }

    return {
        clearForm: clearForm
    };
})();
