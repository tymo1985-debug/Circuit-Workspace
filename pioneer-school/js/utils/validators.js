// validators.js

const Validators = {
  required(value, fieldLabel) {
    if (value === undefined || value === null || String(value).trim() === '') {
      return T('ps.val.field_required', { field: fieldLabel });
    }
    return null;
  },
  showErrors(errors) {
    if (!errors || !errors.length) return;
    alert(errors.join('\n'));
  }
};

window.Validators = Validators;
