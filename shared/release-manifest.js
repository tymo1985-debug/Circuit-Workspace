self.CW_RELEASE = {
  version: '0.42.82',
  changes: [
    { module: 'circuit-planner', version: '9.119.0', note: 'Архив года: повторная отправка больше не затирает архив — убранный год сначала восстанавливается, уменьшение данных — только после подтверждения' },
    { module: 'hub', version: '0.42.82', note: 'Надёжнее запись данных: сохранение подтверждается только после фактической записи на устройство' },
    { module: 'congress-project', version: '4.49.11', technical: true },
    { module: 'pioneer-school', version: '1.15.11', technical: true },
    { module: 'appointments', version: '5.5.203', technical: true },
    { module: 'documents', version: '1.12.75', technical: true },
    { module: 'journal', version: '0.30.6', technical: true },
    { module: 'archive', version: '0.3.9', technical: true },
  ],
};
