// assignment.js — данные документа «Назначение на Школу пионерского служения» (гл.2, п.1, 7)
// Вводится вручную районным старейшиной по факту получения от филиала (интеграции с JW Hub нет).

const Assignment = {
  async get() {
    return DB.getMeta('assignment', {
      startDate: '',
      endDate: '',
      location: '',
      teacherA: '',   // районный старейшина, он же координатор (гл.3, п.3)
      teacherB: '',   // второй преподаватель; если не назначен филиалом — выбирается районным старейшиной (гл.2, п.7)
      teacherBAssignedByBranch: true,
      secondTeacherNote: 'Если в «Назначении» второй преподаватель не указан — выбрать самого подходящего заместителя, способного преподавать всю неделю (гл.2, п.7)'
    });
  },

  async save(data) {
    return DB.setMeta('assignment', data);
  },

  validate(data) {
    const errors = [];
    if (!data.startDate) errors.push(T('ps.val.ukazhite_datu_nachala'));
    if (!data.endDate) errors.push(T('ps.val.ukazhite_datu_okonchaniya'));
    if (!data.location || !data.location.trim()) errors.push(T('ps.val.ukazhite_mesto_provedeniya'));
    if (!data.teacherA || !data.teacherA.trim()) errors.push(T('ps.val.ukazhite_prepodavatelya_a'));
    return errors;
  }
};

window.Assignment = Assignment;
