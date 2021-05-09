/* eslint-env browser */

const util = (function () {
  function clearForm(form) {
    if (typeof form === "string") form = document.querySelector(`#${form}`);

    for (let i = 0; i < form.length; i++) {
      if (form[i].tagName === "INPUT") form[i].value = "";
    }
  }

  function parseQueryString(qs) {
    return qs.split("&").reduce((acc, kv) => {
      const tmp = kv.split("=");
      acc[tmp[0]] = tmp[1];
      return acc;
    }, {});
  }

  return {
    clearForm: clearForm,
    parseQueryString: parseQueryString,
  };
})();
