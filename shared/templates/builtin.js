/**
 * Circuit Workspace — shared/templates/builtin.js
 * Системные шаблоны документов: тексты, которые поставляются вместе с
 * приложением.
 *
 * ПОЧЕМУ В КОДЕ, А НЕ В БАЗЕ. Системный шаблон должен обновляться вместе с
 * приложением — у всех, кто его не правил, новый текст появляется сам. Лежи он
 * в базе, обновить его было бы нечем: выпуск не трогает данные пользователя.
 *
 * КАК УСТРОЕНО ПЕРЕОПРЕДЕЛЕНИЕ. Пользователь правит не этот файл, а СВОЮ копию
 * в `CWDB.templates` с тем же `id`. Пока копии нет, действует текст отсюда.
 * «Восстановить оригинал» = удаление копии, а не перезапись текстом — так не
 * остаётся мусора и не нужно решать, какой из двух текстов «настоящий».
 *
 * ЯЗЫКИ. Один шаблон — несколько колонок перевода. Пустая колонка означает
 * «перевода нет»: движок отдаст первый непустой язык и пометит результат
 * `pending`. Это честнее, чем показывать копию украинского текста под видом
 * русского — ровно так и было до 12.08.2026: `ru` и `de` в Конгрессах были
 * байт-в-байт копиями `uk` (три строки по 1592 символа), и переключатель языка
 * механически работал, не меняя ни слова.
 *
 * ⚠️ ТЕКСТЫ ПИШЕТ НОСИТЕЛЬ ЯЗЫКА. Пустые колонки заполняются только человеком,
 * для которого язык родной, и только после сверки терминологии с jw.org.
 * Заполнить их «переводом по смыслу» нельзя: это документ, который уходит в
 * собрание.
 *
 * ПОЛЕ `title` — техническое имя для журналов и отладки, а НЕ подпись в
 * интерфейсе. Подписи придут из словарей модулей, когда появится библиотека
 * шаблонов (фаза 3).
 */
(function (global) {
  'use strict';

  /* Тексты Клиндария. Письмо у всех трёх типов визита начинается одинаковым
     текстом — это не копипаста «на всякий случай», а исходное поведение
     модуля: он подставлял один и тот же текст всем трём типам, а дальше
     пользователь правил каждый под себя. Общая константа здесь ровно для
     того, чтобы три системных текста не разъехались случайной правкой. */
  var LETTER_BODY_HTML = "<div>Час летить непомітно! Ми з дружиною дуже раді, що прийшов час відвідати ваш збір. Знову для нас велика радість провести з вами час протягом тижня служіння!</div><div>Візит відбудеться з {start_date} до {end_date}.</div><div>Цей тиждень дасть нам можливість служити один одному, щоб Єгова зміцнив нас (Ісаї 41:10).</div><div>Збір, безсумнівно, зрадіє, коли почує про це. Вже одразу ви можете заохочувати братів і сестер якомога активніше підтримувати тиждень служіння. Ви також можете нагадати вісникам про можливість служити в якості допоміжних піонерів з метою 15 або 30 годин в місяці візиту («Пасіть», розділ 15, абзац 1). Усіх, хто виконує будь-яку форму піонерського служіння в цьому місяці, сердечно запрошуємо на піонерську зустріч! Дорогі старійшини, ваші зусилля і підтримка на цьому тижні допоможуть нам усім отримати користь і найбільше заохочення.</div><div>Для нас завжди особлива радість, коли ми співпрацюємо з вами у проповідуванні, наприклад, громадських місцях (служіння зі стендом, служіння водіям-далекобійникам і т.д.). Ми також раді разом з вісниками відвідувати зацікавлених на повторних відвідинах та біблійні вивчення, на які нас вони запрошують. Можливо в зборі є діти чи підлітки, з якими вивчають Біблію — для нас буде велика честь, коли нас на такі вивчення запрошують. Якщо хтось хоче приєднатися до нас у служінні, але не має повторних відвідин або біблійних вивчень, він також може записатися на служіння разом з нами. В такому випадку ми ходимо разом з групою і можемо розділити з ним нашу радість в служінні.</div>";
  var LETTER_MEMO_HTML = "<div>• Будь ласка, ознайомтесь з актуальною формою S-61 (видання 12/25) і заповніть сторінку 2 цієї форми і вишліть його мені. Думки з книги «Пасіть», розділ 10, абзаци 1-5 також допоможуть вам у підготовці до тижня візита</div><div>• Зустріч з призначеними братами плануйте на вечір п'ятниці.</div><div>• Заплануйте 2-3 пастирських візита і, по можливості, не відразу після зустріч для служіння. Будь ласка, залиште ранок четверга вільним.</div><div>‣ Я буду радий відвідати молодих вісників; піонерів; літніх братів чи сестер, які відвідують зібрання лише по телефону або через ZOOM; старійшин, служителів збору та їхні сім'ї і, звичайно, тих, кого ви, як старійшини, вважаєте за потрібне відвідати (за бажанням, ви також можете запланувати «проблемні» візити).</div><div>• Зустрічі для проповідницького служіння (ви можете організувати доступ через ZOOM):</div><div>‣ Організуйте зустрічі для служіння згідно плану для служіння, який я вам висилаю. Час для служіння ви можете вибрати у відповідному полі формуляра</div><div>‣ Виберіть час і місце для зустрічі який буде найліпше пасувати для вісників</div><div>‣ Враховуйте так же потреби території, коли ви будете вибирати час і місце для зустрічей для служіння. Найліпше буде той час, коли буде більше можливостей зустріти людей на території</div><div>‣ Також плануйте зустріч для служіння в неділю до або після зібрання (можемо вирішити під час зустрічі у вівторок)</div><div>‣ Якщо ви вважаєте, що це необхідно, ви, як рада старійшин, можете запланувати додаткову зустріч для проповідницького служіння на ранок четверга. Цю зустріч може проводити один з призначених братів</div><div>• Зустріч з піонерами плануйте в середу ввечері або в суботу, але не одразу після зустрічі для проповідування (старші, хворі або немічні піонери можуть відвідати цю зустріч через ZOOM) — наприклад, з піонерами о 14:00, а для служіння о 15:15 чи 15:30 (це про суботу)</div><div>• Теми промов:</div><div>‣ У вівторок тема службової промови: „Що ти зробиш «задля доброї новини»?\" (Пісня 82).</div><div>‣ Тема публічної промови „Як вам «пожати... вічне життя»?“ (Пісня 147)</div><div>‣ Службова промова на вихідних «Нехай ваші серця не тривожаться» (Пісня 156).</div><div></div><div>Коли я перевірятиму документи у вівторок у другій половині дня, мені знадобляться наступне:</div><div>• Заповнений бланк S-61 та зазначені в ньому документи або папки, а також протокол зустрічі старійшин з пунктом про обговорення останнього звіту районного наглядача.</div><div>• Якщо це можливо, ви можете надіслати мені частину даних в електронному вигляді заздалегідь. Все інше, що неможливо надіслати мені в електронному вигляді (наприклад, папки і т.д.), будь ласка, підготуйте для мене в місці нічлігу.</div><div>• У вівторок ввечері перед зустріччю я хотів би зустрітися з одним із старійшин збору, з координатором ради старійшин, чи з іншим старійшиною. Ми можемо домовитися про час і місце зустрічі перед початком візиту.</div>";

  global.CW_BUILTIN_TEMPLATES = [
    {
      id: 'sys.congress.assignment.invitation',
      context: 'congress.assignment.invitation',
      module: 'congress-project',
      /* Письмо печатается, а не отправляется: темы у него нет. Поле заведено
         в модели, но остаётся null до появления отправки — решение Алекса
         11.08.2026. */
      format: 'text',
      title: 'Приглашение к участию в задании на конгрессе',
      translations: {
        uk: {
          subject: null,
          body: "{{senderName}} / Alex Tymoshchuk\n{{senderCode}}\n{{senderAddress}}\n{{senderPhone1}}\n{{senderPhone2}}\n{{senderEmail}}\n\n**Запрошення до участі у виконанні завдання на районному конгресі:**\n\nДорогий брате **{{participantName}}**,\n\nЯ радий, що ти маєш нагоду виступити на наступному районному конгресі\nза темою:\n**«{{congressName}}»**.\n\nМісце: **{{congressPlace}}**. Дата: **{{congressDate}}**.\n\nЗавдання: № **{{assignmentNumber}}** «**{{assignmentTitle}}**»\n\nТвоє завдання починається о **{{assignmentTime}}**.\n\nЗверни увагу, що твоє завдання включає в себе **{{assignmentType}}**.\n\nРепетиція на сцені: **{{stageRehearsalDate}}** о **{{stageRehearsalTime}}**.\n\nБудь ласка, зроби {{recordingMedia}} запис {{recordingKind}} та надішли його мені на WhatsApp до **{{recordingDeadline}}**.\n\nБудь ласка, уважно ознайомся з формою CO-90, що додається. Не бери більше матеріалу, ніж ти можеш викласти у зрозумілій формі за відведений тобі час. Важливо, щоб ти точно дотримувався встановленого часу. Підготуйте твоє завдання у формі вільного виступу. Намагайся не зачитувати завдання перед аудиторією. Говори з ентузіазмом!\n\nДякую тобі за твою готовність і старанність! Бажаю тобі підтримки Єгови і його Святого Духа під час підготовки твого завдання!\n\nЯкщо у тебе виникнуть запитання, будь ласка, не соромся звертатися до мене по телефону або електронною поштою.\n\nТвій брат,\n{{senderName}},\n{{senderCode}}\n\nPS: Будь ласка, як можна швидше дай мені знати по електронній пошті або WhatsApp до **{{responseDeadline}}**, чи можеш ти взяти на себе це завдання. Щиро дякую!",
        },
        ru: {
          subject: null,
          body: "{{senderName}} / Alex Tymoshchuk\n{{senderCode}}\n{{senderAddress}}\n{{senderPhone1}}\n{{senderPhone2}}\n{{senderEmail}}\n\n**Приглашение принять участие в выполнении задания на районном конгрессе:**\n\nДорогой брат **{{participantName}}**,\n\nРад, что у тебя будет возможность выступить на следующем районном конгрессе\nс темой:\n**«{{congressName}}»**.\n\nМесто: **{{congressPlace}}**. Дата: **{{congressDate}}**.\n\nЗадание: № **{{assignmentNumber}}** «**{{assignmentTitle}}**»\n\nТвоё задание начнётся в **{{assignmentTime}}**.\n\nОбрати внимание, что твоё задание включает **{{assignmentType}}**.\n\nРепетиция на сцене: **{{stageRehearsalDate}}** в **{{stageRehearsalTime}}**.\n\nПожалуйста, сделай {{recordingMedia}} запись {{recordingKind}} и отправь её мне по WhatsApp до **{{recordingDeadline}}**.\n\nПожалуйста, внимательно ознакомься с приложенным формуляром CO-90. Не бери больше материала, чем сможешь понятно изложить за отведённое время. Важно точно придерживаться установленного времени. Подготовь своё задание в форме свободного выступления. Старайся не зачитывать его перед аудиторией. Говори с энтузиазмом!\n\nСпасибо за твою готовность и усердие! Желаю тебе поддержки Иеговы и его святого духа во время подготовки задания!\n\nЕсли у тебя возникнут вопросы, пожалуйста, обращайся ко мне по телефону или электронной почте.\n\nТвой брат,\n{{senderName}},\n{{senderCode}}\n\nPS: Пожалуйста, как можно скорее сообщи мне по электронной почте или WhatsApp до **{{responseDeadline}}**, сможешь ли ты взять на себя это задание. Большое спасибо!",
        },
        de: {
          subject: null,
          body: "{{senderName}} / Alex Tymoshchuk\n{{senderCode}}\n{{senderAddress}}\n{{senderPhone1}}\n{{senderPhone2}}\n{{senderEmail}}\n\n**Einladung zur Mitwirkung an einer Aufgabe auf dem Kreiskongress:**\n\nLieber Bruder **{{participantName}}**,\n\nich freue mich, dass du Gelegenheit hast, auf dem nächsten Kreiskongress\nüber folgendes Thema zu sprechen:\n**„{{congressName}}“**.\n\nOrt: **{{congressPlace}}**. Datum: **{{congressDate}}**.\n\nAufgabe: Nr. **{{assignmentNumber}}** „**{{assignmentTitle}}**“\n\nDeine Aufgabe beginnt um **{{assignmentTime}}**.\n\nBitte beachte, dass deine Aufgabe **{{assignmentType}}** beinhaltet.\n\nBühnenprobe: **{{stageRehearsalDate}}** um **{{stageRehearsalTime}}**.\n\nBitte erstelle eine {{recordingMedia}}-Aufnahme von {{recordingKind}} und sende sie mir bis **{{recordingDeadline}}** über WhatsApp.\n\nBitte lies dir das beigefügte Formular CO-90 sorgfältig durch. Nimm nicht mehr Stoff, als du in der vorgegebenen Zeit verständlich behandeln kannst. Es ist wichtig, dass du dich genau an die vorgegebene Zeit hältst. Bereite deine Aufgabe als freien Vortrag vor. Versuch, sie vor den Zuhörern nicht abzulesen. Sprich mit Begeisterung!\n\nVielen Dank für deine Bereitschaft und deinen Fleiß! Ich wünsche dir Jehovas Unterstützung und seinen heiligen Geist bei der Vorbereitung deiner Aufgabe!\n\nFalls du Fragen hast, kannst du dich gern telefonisch oder per E-Mail an mich wenden.\n\nDein Bruder,\n{{senderName}},\n{{senderCode}}\n\nPS: Bitte teile mir so bald wie möglich bis **{{responseDeadline}}** per E-Mail oder WhatsApp mit, ob du diese Aufgabe übernehmen kannst. Vielen Dank!",
        },
      },
    },

    {
      id: 'sys.visit.congregation.letter',
      context: 'visit.congregation.letter',
      module: 'circuit-planner',
      format: 'html',
      title: 'Письмо перед визитом (Congregation)',
      /* Дополнительные страницы принадлежат документу целиком, а не колонке
         перевода: памятка печатается второй страницей того же письма. */
      pages: [{ id: 'p1', title: "ПАМ’ЯТКА ДЛЯ КООРДИНАТОРА РАДИ СТАРІЙШИН", html: LETTER_MEMO_HTML }],
      translations: {
        uk: { subject: null, body: LETTER_BODY_HTML },
      },
    },
    {
      id: 'sys.visit.group.letter',
      context: 'visit.group.letter',
      module: 'circuit-planner',
      format: 'html',
      title: 'Письмо перед визитом (Group)',
      /* Дополнительные страницы принадлежат документу целиком, а не колонке
         перевода: памятка печатается второй страницей того же письма. */
      pages: [{ id: 'p1', title: "ПАМ’ЯТКА ДЛЯ КООРДИНАТОРА РАДИ СТАРІЙШИН", html: LETTER_MEMO_HTML }],
      translations: {
        uk: { subject: null, body: LETTER_BODY_HTML },
      },
    },
    {
      id: 'sys.visit.pregroup.letter',
      context: 'visit.pregroup.letter',
      module: 'circuit-planner',
      format: 'html',
      title: 'Письмо перед визитом (Pregroup)',
      /* Дополнительные страницы принадлежат документу целиком, а не колонке
         перевода: памятка печатается второй страницей того же письма. */
      pages: [{ id: 'p1', title: "ПАМ’ЯТКА ДЛЯ КООРДИНАТОРА РАДИ СТАРІЙШИН", html: LETTER_MEMO_HTML }],
      translations: {
        uk: { subject: null, body: LETTER_BODY_HTML },
      },
    },
    {
      id: 'sys.visit.congregation.email',
      context: 'visit.congregation.email',
      module: 'circuit-planner',
      format: 'html',
      title: 'Тело сопроводительного письма (Congregation)',
      /* Текст русский — это записка координатору, а не сам документ.
         Поэтому колонка ru, а не uk: подписывать русский текст украинским
         языком нельзя, даже если fallback всё равно отдаст его любому языку.
         Формат переведён на html 02.09.2026 (RTE Ж/К/Ч для этих трёх
         email-body шаблонов) — старые legacy-токены в одинарных скобках
         ({congregation}, {start_date}, {end_date}) не тронуты и продолжают
         разрешаться движком (TOKEN regex ищет их независимо от окружающей
         HTML-разметки). Body обёрнут в <p>, как это делает plainToHtml()
         для остальных text-шаблонов — тот же визуальный результат, что и
         раньше, просто теперь редактируемый через RTE. */
      translations: {
        ru: { subject: null, body: "<p>Здравствуйте! Направляю письмо перед визитом к собранию {congregation} ({start_date} — {end_date}), см. вложение.</p>" },
      },
    },
    {
      id: 'sys.visit.group.email',
      context: 'visit.group.email',
      module: 'circuit-planner',
      format: 'html',
      title: 'Тело сопроводительного письма (Group)',
      /* См. пояснение у sys.visit.congregation.email выше — тот же перевод
         на html, тот же принцип обёртки в <p>. */
      translations: {
        ru: { subject: null, body: "<p>Здравствуйте! Направляю письмо перед визитом к группе {congregation} ({start_date} — {end_date}), см. вложение.</p>" },
      },
    },
    {
      id: 'sys.visit.pregroup.email',
      context: 'visit.pregroup.email',
      module: 'circuit-planner',
      format: 'html',
      title: 'Тело сопроводительного письма (Pregroup)',
      /* См. пояснение у sys.visit.congregation.email выше — тот же перевод
         на html, тот же принцип обёртки в <p>. */
      translations: {
        ru: { subject: null, body: "<p>Здравствуйте! Направляю письмо перед визитом к предгруппе {congregation} ({start_date} — {end_date}), см. вложение.</p>" },
      },
    },
    /* ── Школа пионеров (фаза 6, 14.08.2026) ──────────────────────────────
       Первый и пока единственный документ модуля. Формат `text`, а не `html`:
       жирного начертания в PDF Школы нет (встроенный субсет DejaVu собран
       только в normal), а поле визуальной правки обещало бы то, чего сборщик
       не умеет.

       ТЕКСТ НИЖЕ — АДМИНИСТРАТИВНЫЙ КАРКАС, А НЕ ГОТОВАЯ ФОРМУЛИРОВКА. Он
       намеренно состоит из фактов (даты, место, преподаватели, срок сдачи
       анкеты) и не содержит оборотов, которые нужно сверять с jw.org:
       окончательный текст пишет пользователь в модуле «Документы», и текст
       этот принадлежит ему — ровно та граница, по которой шаблоны вообще
       попадают в общий слой.

       Подпись разнесена по строкам, а не собрана через « · »: при незаполненном
       общем отправителе (а Школу могут открыть раньше Клиндария) разделитель
       оставался в готовом письме висеть в одиночестве. Пустые строки в хвосте
       срезает Letters.build().

       Обращение «Дорогой брат / дорогая сестра» — не небрежность: поля пола у
       учащегося в базе нет, а на школу приглашают и братьев, и сестёр.
       Автоматический выбор потребовал бы нового поля в карточке и в анкете —
       отдельная задача, см. IDEAS.md. */
    {
      id: 'sys.school.student.invitation',
      context: 'school.student.invitation',
      module: 'pioneer-school',
      format: 'text',
      title: 'Приглашение учащегося на Школу пионерского служения',
      translations: {
        ru: {
          subject: null,
          body: "Дорогой брат / дорогая сестра {{student.firstName}}!\n\nРад сообщить, что ты приглашён(а) на Школу пионерского служения.\n\nДаты: {{school.startDate}} — {{school.endDate}}\nМесто: {{school.place}}\nПреподаватели: {{school.teacherA}}, {{school.teacherB}}\n\nПожалуйста, заполни формуляр учащегося до {{school.registrationDeadline}} и отправь его на {{school.registrationEmail}} или через WhatsApp {{school.registrationWhatsapp}}.\n\nЕсли у тебя возникнут вопросы, пиши или звони мне.\n\nТвой брат,\n{{sender.name}}\n{{sender.code}}\n{{sender.phone1}}\n{{sender.email}}",
        },
        uk: {
          subject: null,
          body: "Дорогий брате / Дорога сестро {{student.firstName}}!\n\nРадий повідомити, що тебе запрошено до Школи піонерського служіння.\n\nДати: {{school.startDate}} — {{school.endDate}}\nМісце: {{school.place}}\nВикладачі: {{school.teacherA}}, {{school.teacherB}}\n\nБудь ласка, заповни формуляр учня до {{school.registrationDeadline}} і надішли його на {{school.registrationEmail}} або через WhatsApp на {{school.registrationWhatsapp}}.\n\nЯкщо у тебе виникнуть запитання, напиши або зателефонуй мені.\n\nТвій брат,\n{{sender.name}}\n{{sender.code}}\n{{sender.phone1}}\n{{sender.email}}",
        },
        en: {
          subject: null,
          body: "Dear Brother / Dear Sister {{student.firstName}}!\n\nI am pleased to let you know that you have been invited to attend the Pioneer Service School.\n\nDates: {{school.startDate}} — {{school.endDate}}\nLocation: {{school.place}}\nInstructors: {{school.teacherA}}, {{school.teacherB}}\n\nPlease complete the student form by {{school.registrationDeadline}} and send it to {{school.registrationEmail}} or via WhatsApp at {{school.registrationWhatsapp}}.\n\nIf you have any questions, write or call me.\n\nYour brother,\n{{sender.name}}\n{{sender.code}}\n{{sender.phone1}}\n{{sender.email}}",
        },
        pl: {
          subject: null,
          body: "Drogi Bracie / Droga Siostro {{student.firstName}}!\n\nZ przyjemnością informuję, że zostałeś(-aś) zaproszony(-a) na Kurs Służby Pionierskiej.\n\nTerminy: {{school.startDate}} — {{school.endDate}}\nMiejsce: {{school.place}}\nWykładowcy: {{school.teacherA}}, {{school.teacherB}}\n\nProszę, wypełnij formularz uczestnika do {{school.registrationDeadline}} i wyślij go na adres {{school.registrationEmail}} lub przez WhatsApp na {{school.registrationWhatsapp}}.\n\nJeśli masz pytania, napisz lub zadzwoń do mnie.\n\nTwój brat,\n{{sender.name}}\n{{sender.code}}\n{{sender.phone1}}\n{{sender.email}}",
        },
        de: {
          subject: null,
          body: "Lieber Bruder / Liebe Schwester {{student.firstName}}!\n\nIch freue mich, dir mitzuteilen, dass du zur Pionierdienstschule eingeladen bist.\n\nZeitraum: {{school.startDate}} — {{school.endDate}}\nOrt: {{school.place}}\nUnterweiser: {{school.teacherA}}, {{school.teacherB}}\n\nBitte fülle das Schülerformular bis {{school.registrationDeadline}} aus und sende es an {{school.registrationEmail}} oder über WhatsApp an {{school.registrationWhatsapp}}.\n\nFalls du Fragen hast, schreib mir oder ruf mich an.\n\nDein Bruder,\n{{sender.name}}\n{{sender.code}}\n{{sender.phone1}}\n{{sender.email}}",
        },
      },
    },

    {
      id: 'sys.visit.congregation.salutation',
      context: 'visit.congregation.salutation',
      module: 'circuit-planner',
      format: 'text',
      title: 'Обращение в шапке письма (Congregation)',
      translations: {
        uk: { subject: null, body: "До старійшин збору {congregation}{cong_number_suffix}" },
      },
    },
    {
      id: 'sys.visit.group.salutation',
      context: 'visit.group.salutation',
      module: 'circuit-planner',
      format: 'text',
      title: 'Обращение в шапке письма (Group)',
      translations: {
        uk: { subject: null, body: "Відповідальному брату групи {congregation}" },
      },
    },
    {
      id: 'sys.visit.pregroup.salutation',
      context: 'visit.pregroup.salutation',
      module: 'circuit-planner',
      format: 'text',
      title: 'Обращение в шапке письма (Pregroup)',
      translations: {
        uk: { subject: null, body: "Відповідальному брату передгрупи {congregation}" },
      },
    },
  ];
})(typeof self !== 'undefined' ? self : this);
