// validators.js

const Validators = {
  required(value, fieldLabel) {
    if (value === undefined || value === null || String(value).trim() === '') {
      return `Поле «${fieldLabel}» обязательно`;
    }
    return null;
  },
  showErrors(errors) {
    if (!errors || !errors.length) return;
    alert(errors.join('\n'));
  }
};

window.Validators = Validators;
