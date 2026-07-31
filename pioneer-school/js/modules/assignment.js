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
    if (!data.startDate) errors.push('Укажите дату начала Школы');
    if (!data.endDate) errors.push('Укажите дату окончания Школы');
    if (!data.location || !data.location.trim()) errors.push('Укажите место проведения');
    if (!data.teacherA || !data.teacherA.trim()) errors.push('Укажите Преподавателя А (районного старейшину)');
    return errors;
  }
};

window.Assignment = Assignment;
