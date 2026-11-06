/* =========================================================
   Mobius | موبيوس — site assistant ("Ask Mobius")
   A chat window that answers questions about the site:
   which book to start with, what is in a subject, what a
   book is about, how to download, the levels, and so on.

   It works on its own, in the browser, for free: it reads the
   site's own data (search-index.js and book-info.js), so it
   always knows every book. English, Arabic and Kurdish (Badini).

   OPTIONAL — real AI (Google Gemini, free tier) through the
   Cloudflare Worker below (the mubius-ai repository). Harder or
   free-form questions go to the AI; if the AI is busy or the daily
   free limit is used up, the built-in assistant answers instead.
   The Worker builds the AI's instructions and book list itself
   from this site's data, so the page only sends the question.
   ========================================================= */
(function () {
  "use strict";

  var AI_ENDPOINT = "https://mobius-ai.ts7h2rbpnb.workers.dev"; // empty string turns AI answers off

  /* Google's terms for the free Gemini API: it may not be used by anyone under 18,
     and it may not be offered to people in the EU/EEA, Switzerland or the UK.
     So AI answers stay off until a visitor says they are 18 or over (saved on their
     device), and never run where the device's time zone is in those countries.
     The Cloudflare Worker should also refuse those countries (see the developer notes). */
  var NO_FREE_AI = /^(Europe\/(Vienna|Brussels|Sofia|Zagreb|Prague|Copenhagen|Tallinn|Helsinki|Mariehamn|Paris|Berlin|Busingen|Athens|Budapest|Dublin|Rome|Riga|Vilnius|Luxembourg|Malta|Amsterdam|Warsaw|Lisbon|Bucharest|Bratislava|Ljubljana|Madrid|Stockholm|Vaduz|Oslo|Zurich|London|Belfast)|Asia\/(Nicosia|Famagusta)|Atlantic\/(Reykjavik|Madeira|Azores|Canary)|Africa\/Ceuta|Arctic\/Longyearbyen|Indian\/(Reunion|Mayotte)|America\/(Guadeloupe|Martinique|Cayenne|Marigot|St_Barthelemy))$/;
  var aiRegionOK = (function () {
    try { return !NO_FREE_AI.test(Intl.DateTimeFormat().resolvedOptions().timeZone || ""); } catch (e) { return true; }
  })();
  // when the AI says it is busy (its free limit, or this visitor's), the chat answers on its
  // own for a minute instead of asking again at once
  var aiRestUntil = 0;
  function aiAllowed() { return !!AI_ENDPOINT && aiRegionOK && Date.now() >= aiRestUntil && store("local", "mobius-ai-18") === "yes"; }

  var UI = window.MobiusUI;
  var INDEX = window.MOBIUS_INDEX;
  var I18N = window.MOBIUS_I18N || {};
  if (!UI || !INDEX || !INDEX.books || !INDEX.books.length) return;

  var root = document.documentElement;
  var url = UI.url;

  function store(kind, key, val) {
    try {
      var s = kind === "local" ? localStorage : sessionStorage;
      if (val === undefined) return s.getItem(key);
      if (val === null) s.removeItem(key); else s.setItem(key, val);
    } catch (e) { return null; }
  }

  /* ---------------------------------------------------------
     Words the assistant says
     --------------------------------------------------------- */
  function fmt(s, a) {
    return s.replace(/\{(\w+)\}/g, function (_, k) { return a && a[k] !== undefined ? a[k] : ""; });
  }

  var STR = {
    en: {
      title: "Ask Mobius",
      greet: "Hi! Ask me about any book",
      sub: "Answers about the books on this site",
      ph: "Ask about a book or a subject…",
      send: "Send", close: "Close", reset: "New chat", typing: "Typing…",
      welcome: "Hi! I'm the Mobius assistant. Ask me which book to start with, what's in a subject, what a book is about, or anything about the site.",
      chips: ["Where do I start in physics?", "Quantum mechanics books", "A hard electromagnetism book", "How do I download a book?", "What is Mobius?"],
      inSubject: "**{s}** has {n} books, from easiest to hardest:",
      openPage: "Open the {s} page",
      startWith: "Start with **{t}** ({lv}).",
      thenNext: "After that, move on to:",
      whoFor: "Who it's for:",
      atLevel: "**{lv}** books in **{s}**:",
      noLevel: "There's no {lv} book in {s}. These are the closest:",
      noteBooks: "Books marked “{note}” in **{s}**:",
      noNote: "No book in {s} is marked “{note}”. Here are all its books:",
      bookLine: "**{t}** by {a} is a **{lv}** book in **{s}**.",
      alsoFound: "Also found:",
      tapBook: "Tap the book to open it.",
      noInfo: "A full description of this book is coming soon.",
      site: "**Mobius** is a free library for physics and maths students: books and full lecture courses. It has **{nb} books** in **{ns} subjects**: {nt} academic subjects and {np} pop-science subjects. Each academic subject also has full lecture courses. Every book sits on one of five levels, from Beginner to Extreme, so you always know where to start.\nFounder & designer: **Zhehat** · Developer: **RAMN**",
      me: "I'm the Mobius assistant. I know every book and subject on this site, so ask me what to read, what a book is about, or how the site works. I only answer questions about the site.",
      levels: "Every book is placed on one of five levels within its subject:",
      download: "Tap any book to open its panel. It has **Read online** and **Download PDF** buttons.\nBook links are still being added, so if a button says the link is coming soon, that book isn't up yet.",
      howto: "• **Search**: the search button at the top (or press /) finds any book, author or subject.\n• **Language**: the globe button switches between English, Arabic and Kurdish (Badini).\n• **Light / dark**: the sun and moon button.\n• **Levels**: on a subject page, the level buttons show the books of one level only.",
      count: "Mobius has **{nb} books** in **{ns} subjects** ({nt} academic subjects and {np} pop-science subjects).",
      countSubject: "**{s}** has **{n} books**.",
      contact: "You can reach Mobius on Instagram: **@mobius.sci**, or write to us from the **Feedback** page (its link is at the bottom of every page). The site is made by **Zhehat** (founder and designer) and **RAMN** (developer).",
      subjects: "All {n} subjects:",
      category: "{name} subjects:",
      which: "Which subject? Pick one and I'll tell you where to start:",
      thanks: "You're welcome! Ask me anything else about the books.",
      fallback: "I couldn't find that on Mobius. I only know this site's books and subjects, so try a subject, a book title or an author. For example:",
      nBooks: "{n} books",
      aiOffNote: "Answers come from Mobius itself. Answers from Google's Gemini AI are only for visitors aged 18 or over.",
      aiYes: "I'm 18 or over, use AI",
      aiOnNote: "AI is on (Google Gemini). Answers can be wrong. Your questions are sent to Google, which may keep them and have people read them, so don't type personal details.",
      aiStop: "Turn off",
      privacy: "Privacy"
    },
    ar: {
      title: "اسأل موبيوس",
      greet: "أهلاً! اسألني عن أي كتاب",
      sub: "يجيب عن كتب هذا الموقع",
      ph: "اسأل عن كتاب أو مادة…",
      send: "إرسال", close: "إغلاق", reset: "محادثة جديدة", typing: "يكتب…",
      welcome: "أهلاً! أنا مساعد موبيوس. اسألني من أي كتاب تبدأ، أو ما الكتب في مادة معيّنة، أو عن ماذا يتكلم كتاب، أو أي شيء عن الموقع.",
      chips: ["من أين أبدأ في الفيزياء؟", "كتب ميكانيك الكم", "كتاب صعب في الكهرومغناطيسية", "كيف أحمّل كتاباً؟", "ما هو موبيوس؟"],
      inSubject: "في **{s}** {n} كتب، مرتبة من الأسهل إلى الأصعب:",
      openPage: "افتح صفحة {s}",
      startWith: "ابدأ بكتاب **{t}** ({lv}).",
      thenNext: "بعده انتقل إلى:",
      whoFor: "لمن هو:",
      atLevel: "كتب بمستوى **{lv}** في **{s}**:",
      noLevel: "لا يوجد كتاب بمستوى «{lv}» في {s}. هذه أقرب الكتب:",
      noteBooks: "كتب «{note}» في **{s}**:",
      noNote: "لا يوجد في {s} كتاب من نوع «{note}». هذه كل كتبها:",
      bookLine: "كتاب **{t}** للمؤلف {a}، بمستوى **{lv}** في مادة **{s}**.",
      alsoFound: "وجدت أيضاً:",
      tapBook: "اضغط على الكتاب لفتحه.",
      noInfo: "سيُضاف وصف كامل لهذا الكتاب قريباً.",
      site: "**موبيوس** مكتبة مجانية لطلاب الفيزياء والرياضيات: كتب ومقررات محاضرات كاملة. فيه **{nb} كتاباً** في **{ns} مادة**: {nt} مادة أكاديمية و{np} مواد من العلوم المبسّطة. كل كتاب موضوع في مستوى من خمسة، من «مبتدئ» إلى «متقدّم جدًا»، حتى تعرف دائماً من أين تبدأ.\nالمؤسس والمصمم: **Zhehat** · المطوّر: **RAMN**",
      me: "أنا مساعد موبيوس. أعرف كل كتاب وكل مادة في هذا الموقع، فاسألني ماذا تقرأ، أو عن ماذا يتكلم كتاب معيّن، أو كيف يعمل الموقع. أجيب فقط عن الأسئلة المتعلقة بالموقع.",
      levels: "كل كتاب موضوع في واحد من خمسة مستويات داخل مادته:",
      download: "اضغط على أي كتاب لتفتح نافذته، وفيها زرّا **اقرأ أونلاين** و**تحميل PDF**.\nروابط الكتب ما زالت تُضاف، فإذا ظهر لك أن الرابط سيُضاف قريباً فهذا الكتاب لم يُرفع بعد.",
      howto: "• **البحث**: زر البحث في الأعلى (أو اضغط /) يجد أي كتاب أو مؤلف أو مادة.\n• **اللغة**: زر الكرة الأرضية يبدّل بين الإنجليزية والعربية والكردية (البادينية).\n• **فاتح / داكن**: زر الشمس والقمر.\n• **المستويات**: في صفحة المادة، أزرار المستويات تعرض كتب مستوى واحد فقط.",
      count: "في موبيوس **{nb} كتاباً** في **{ns} مادة** ({nt} مادة أكاديمية و{np} مواد من العلوم المبسّطة).",
      countSubject: "في **{s}** **{n} كتب**.",
      contact: "يمكنك التواصل مع موبيوس عبر إنستغرام: **@mobius.sci**، أو مراسلتنا من صفحة **الملاحظات** (رابطها في أسفل كل صفحة). الموقع من عمل **Zhehat** (المؤسس والمصمم) و**RAMN** (المطوّر).",
      subjects: "كل المواد ({n}):",
      category: "مواد {name}:",
      which: "في أي مادة؟ اختر واحدة وأقول لك من أين تبدأ:",
      thanks: "العفو! اسألني أي شيء آخر عن الكتب.",
      fallback: "لم أجد هذا في موبيوس. أنا أعرف كتب الموقع ومواده فقط، فجرّب اسم مادة أو عنوان كتاب أو اسم مؤلف. مثلاً:",
      nBooks: "{n} كتب",
      aiOffNote: "الإجابات من موبيوس نفسه. إجابات الذكاء الاصطناعي (Gemini من Google) متاحة فقط لمن عمره 18 سنة أو أكثر.",
      aiYes: "عمري 18 أو أكثر، فعّل الذكاء الاصطناعي",
      aiOnNote: "الذكاء الاصطناعي مفعّل (Gemini من Google). قد تكون الإجابات خاطئة. أسئلتك تُرسل إلى Google وقد تحتفظ بها ويقرؤها أشخاص لديها، فلا تكتب معلومات شخصية.",
      aiStop: "إيقاف",
      privacy: "الخصوصية"
    },
    ku: {
      title: "پسیارێ ژ موبیوس بکە",
      greet: "سلاڤ! پسیارا هەر پەرتووکەکێ ژ من بکە",
      sub: "بەرسڤا پسیارێن پەرتووکێن ڤی ماڵپەڕی ددەت",
      ph: "پسیارا پەرتووکەکێ یان بابەتەکی بکە…",
      send: "بفڕێنە", close: "گرتن", reset: "ئاخفتنەکا نوو", typing: "دنڤیسیت…",
      welcome: "سلاڤ! ئەز هاریکارێ موبیوس م. پسیار بکە ب کیژ پەرتووکێ دەستپێبکەی، چ پەرتووک د بابەتەکی دا هەنە، پەرتووکەک دەربارەی چیە، یان هەر تشتەکی دەربارەی ماڵپەڕی.",
      chips: ["ل فیزیایێ ژ کیڤە دەستپێبکەم؟", "پەرتووکێن میکانیکا کوانتەمی", "پەرتووکەکا دژوار یا ئەلیکترۆموگناتیسێ", "چاوا پەرتووکەکێ داگرم؟", "موبیوس چیە؟"],
      inSubject: "د **{s}** دا {n} پەرتووک هەنە، ژ ئاسانترین هەتا دژوارترین:",
      openPage: "پەڕێ {s} ڤەکە",
      startWith: "ب **{t}** دەستپێبکە ({lv}).",
      thenNext: "پاشان بچە بۆ:",
      whoFor: "بۆ کێ یە:",
      atLevel: "پەرتووکێن ئاستێ **{lv}** د **{s}** دا:",
      noLevel: "د {s} دا چ پەرتووکێن ئاستێ «{lv}» نینن. ئەڤە نێزیکترینن:",
      noteBooks: "پەرتووکێن «{note}» د **{s}** دا:",
      noNote: "د {s} دا چ پەرتووکێن «{note}» نینن. ئەڤە هەمی پەرتووکێن وێ نە:",
      bookLine: "**{t}** یا {a} یە، ئاستێ **{lv}** د بابەتێ **{s}** دا.",
      alsoFound: "هەروەسا هاتنە دیتن:",
      tapBook: "کلیک ل سەر پەرتووکێ بکە دا ڤەبیت.",
      noInfo: "وەسفەکێ تەمام یێ ڤی پەرتووکی دێ زوو هێتە دانان.",
      site: "**موبیوس** پەرتووکخانەیەکا بێ بەرامبەرە بۆ قوتابیێن فیزیا و بیرکاریێ: پەرتووک و کۆرسێن تەمام یێن وانان. **{nb} پەرتووک** د **{ns} بابەتان** دا تێدا هەنە: {nt} بابەتێن ئەکادیمی و {np} بابەتێن زانستا سادە. هەر پەرتووکەک ل سەر ئێک ژ پێنج ئاستان هاتیە دانان، ژ «دەستپێک» هەتا «گەلەک دژوار»، دا تو هەردەم بزانی ژ کیڤە دەستپێبکەی.\nدامەزرێنەر و دیزاینەر: **Zhehat** · پەرەپێدەر: **RAMN**",
      me: "ئەز هاریکارێ موبیوس م. ئەز هەمی پەرتووک و بابەتێن ڤی ماڵپەڕی دنیاسم، پسیار بکە چ بخوینی، پەرتووکەک دەربارەی چیە، یان ماڵپەڕ چاوا کار دکەت. ئەز تنێ بەرسڤا پسیارێن دەربارەی ماڵپەڕی ددەم.",
      levels: "هەر پەرتووکەک د بابەتێ خۆ دا ل سەر ئێک ژ پێنج ئاستان هاتیە دانان:",
      download: "کلیک ل سەر هەر پەرتووکەکێ بکە دا پەنجەرا وێ ڤەبیت، دوو دوگمە تێدا هەنە: **ئۆنلاین بخوینە** و **داگرتنا PDF**.\nلینکێن پەرتووکان هێشتا دهێنە زێدەکرن، ئەگەر هاتە نڤیسین کو لینک دێ زوو هێتە دانان، واتە ئەو پەرتووک هێشتا نەهاتیە بارکرن.",
      howto: "• **لێگەریان**: دوگمەیا لێگەریانێ ل سەری (یان / بکە) هەر پەرتووک، نڤیسەر یان بابەتەکی دبینیت.\n• **زمان**: دوگمەیا گۆگێ زمانی دگوهۆڕیت: ئینگلیزی، عەرەبی و کوردی (بادینی).\n• **ڕووناهی / تاری**: دوگمەیا ڕۆژ و هەیڤێ.\n• **ئاست**: ل پەڕێ بابەتی، دوگمەیێن ئاستان تنێ پەرتووکێن ئێک ئاستی نیشان ددەن.",
      count: "د موبیوس دا **{nb} پەرتووک** د **{ns} بابەتان** دا هەنە ({nt} بابەتێن ئەکادیمی و {np} بابەتێن زانستا سادە).",
      countSubject: "د **{s}** دا **{n} پەرتووک** هەنە.",
      contact: "تو دشێی ل ئینستاگرامێ پەیوەندیێ ب موبیوس ڤە بکەی: **@mobius.sci**، یان ژ پەڕا **ڕا و بۆچوونان** (لینکا وێ ل بنێ هەر پەڕەکێ یە) نامەیێ بۆ مە بنێری. ماڵپەڕ ژ لایێ **Zhehat** (دامەزرێنەر و دیزاینەر) و **RAMN** (پەرەپێدەر) ڤە هاتیە چێکرن.",
      subjects: "هەمی بابەت ({n}):",
      category: "بابەتێن {name}:",
      which: "کیژ بابەت؟ ئێکێ هەلبژێرە دا بێژمە تە ژ کیڤە دەستپێبکەی:",
      thanks: "سەر چاڤان! هەر پسیارەکا دی دەربارەی پەرتووکان بکە.",
      fallback: "من ئەڤە ل موبیوس نەدیت. ئەز تنێ پەرتووک و بابەتێن ڤی ماڵپەڕی دنیاسم، ناڤێ بابەتەکی، پەرتووکەکێ یان نڤیسەرەکی تاقی بکە. بۆ نموونە:",
      nBooks: "{n} پەرتووک",
      aiOffNote: "بەرسڤ ژ موبیوس بخۆ دهێن. بەرسڤێن ژیریا دەستکرد (Gemini یێ Google) تنێ بۆ وان کەسانە یێن 18 سالی یان پتر.",
      aiYes: "ئەز 18 سالی یان پتر م، AI ڤەکە",
      aiOnNote: "AI یێ ڤەکری یە (Gemini یێ Google). دبیت بەرسڤ شاش بن. پسیارێن تە بۆ Google دهێنە هنارتن، دبیت بپارێزیت و کەسێن وێ بخوینن، لەوما زانیاریێن کەسی نەنڤیسە.",
      aiStop: "ڕاوەستینە",
      privacy: "پاراستنا زانیاریان"
    }
  };

  function S(L, key, args) {
    var v = (STR[L] && STR[L][key]) || STR.en[key];
    return typeof v === "string" ? fmt(v, args) : v;
  }
  // site words (subject names, levels) in a given language
  function W(L, key) {
    if (L === "en") return key;
    var d = I18N[L];
    return (d && d[key]) || key;
  }
  var LEVELS = ["beginner", "easy", "medium", "hard", "extreme"];
  var LEVEL_TAG = { beginner: "Start here", easy: "First course", medium: "Standard text", hard: "Advanced", extreme: "Graduate level" };
  function levelName(L, lv) { return W(L, lv.charAt(0).toUpperCase() + lv.slice(1)); }
  function subjName(L, s) { return W(L, INDEX.subjects[s].name); }

  /* ---------------------------------------------------------
     Text folding (same idea as the site search)
     --------------------------------------------------------- */
  function fold(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[\u064b-\u0670\u065f\u0640]/g, "")
      .replace(/[أإآٱ]/g, "ا").replace(/ى|ي/g, "ی").replace(/ك/g, "ک")
      .replace(/ة/g, "ه").replace(/ە/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ی")
      .replace(/[—–\-&,.:;'’"()|?!؟،؛«»“”\/\\*+=<>\[\]{}]/g, " ")
      .replace(/\s+/g, " ").trim();
  }
  var AR_PREFIX = /^(وال|بال|فال|کال|لل|ال)/;
  function strip(t) {
    var s = t.replace(AR_PREFIX, "");
    if (s !== t && s.length >= 2) return s;
    if (t.length > 4 && t.charAt(0) === "و") return t.slice(1);
    return t;
  }
  function tokens(s) { return fold(s).split(" ").filter(Boolean); }

  // does query word q match word w? (w comes from a keyword list)
  function wordMatch(q, w) {
    if (w.length < 3) return q === w;
    if (q === w) return true;
    if (/^[a-z0-9']+$/.test(w)) {
      // English: the word itself or a plural ("hard" must not match "Hardy")
      return q === w + "s" || q === w + "es" || q === w + "'s";
    }
    var qs = strip(q), ws = strip(w);
    if (w.length >= 4 && q.indexOf(w) === 0) return true;
    if (ws.length >= 3 && (qs === ws || (ws.length >= 4 && qs.indexOf(ws) === 0))) return true;
    return false;
  }

  // a keyword list: phrases -> [{words, len}]
  function prep(list) {
    return list.map(function (p) {
      var w = tokens(p);
      return { w: w, len: w.join("").length };
    }).filter(function (p) { return p.w.length; });
  }
  // best phrase match: returns {score, used:[token indexes]} or null
  function bestMatch(qt, phrases, used) {
    var best = null;
    phrases.forEach(function (p) {
      for (var i = 0; i + p.w.length <= qt.length; i++) {
        var ok = true;
        for (var j = 0; j < p.w.length; j++) {
          if ((used && used[i + j]) || !wordMatch(qt[i + j], p.w[j])) { ok = false; break; }
        }
        if (ok && (!best || p.len > best.score)) {
          var used = [];
          for (var k = 0; k < p.w.length; k++) used.push(i + k);
          best = { score: p.len, used: used };
        }
      }
    });
    return best;
  }

  /* ---------------------------------------------------------
     What words point to which subject
     --------------------------------------------------------- */
  var SUBJECT_WORDS = [
    /* 0 */ ["introduction to physics", "intro physics", "general physics", "basic physics", "physics basics", "فيزياء عامة", "مقدمة الفيزياء", "مقدمة في الفيزياء", "اساسيات الفيزياء", "مبادئ الفيزياء", "فیزیایا گشتی", "فیزیا گشتی", "دەستپێکا فیزیایێ"],
    /* 1 */ ["classical mechanics", "mechanics", "newtonian mechanics", "lagrangian", "hamiltonian", "ميكانيك", "ميكانيكا", "الميكانيك الكلاسيكي", "ميكانيكا كلاسيكية", "ميكانيك كلاسيكي", "میکانیک", "میکانیکا کلاسیکی"],
    /* 2 */ ["electromagnetism", "electrodynamics", "electricity", "magnetism", "maxwell", "electromagnetic", "كهرومغناطيسية", "كهرومغناطيس", "الكهربائية والمغناطيسية", "الكهربائية", "الكهرباء", "كهرباء", "المغناطيسية", "مغناطيسية", "الكهروديناميك", "الديناميكا الكهربائية", "ئەلیکترۆموگناتیس", "ئەلیکترۆداینامیک", "کارەبا", "موگناتیس", "کارۆموگناتیس"],
    /* 3 */ ["thermodynamics", "statistical mechanics", "statistical physics", "thermal physics", "heat", "ثرموداينمك", "ثرموداينامك", "ثرمو", "الديناميكا الحرارية", "ديناميكا حرارية", "الحرارة", "حرارة", "ميكانيك احصائي", "الميكانيك الاحصائي", "ميكانيكا احصائية", "فيزياء احصائية", "ترموديناميك", "تێرمۆداینامیک", "میکانیکا ئاماری", "گەرمی"],
    /* 4 */ ["quantum mechanics", "quantum", "qm", "schrodinger", "الکم", "الكمي", "الكمية", "ميكانيك الكم", "ميكانيكا الكم", "الميكانيك الكمي", "كوانتم", "كوانتوم", "شرودنجر", "کوانتەم", "کوانتەمی", "کوانتم", "میکانیکا کوانتەمی"],
    /* 5 */ ["optics", "waves", "light waves", "البصريات", "بصريات", "الموجات", "موجات", "الامواج", "امواج", "الضوء", "ضوء", "ئۆپتیک", "شەپۆل", "ڕووناهی"],
    /* 6 */ ["relativity", "special relativity", "general relativity", "النسبية", "نسبية", "النسبيه", "ڕێژەیی", "ریژەیی"],
    /* 7 */ ["solid state", "condensed matter", "الحالة الصلبة", "حالة صلبة", "فيزياء الحالة الصلبة", "المادة المكثفة", "الجوامد", "دۆخێ ڕەق", "ماددێ چڕ"],
    /* 8 */ ["nuclear", "particle physics", "particles", "النووية", "نووية", "نووي", "الفيزياء النووية", "الجسيمات", "جسيمات", "ناڤکی", "ناوەکی", "پارتیکل"],
    /* 9 */ ["astrophysics", "cosmology", "astronomy", "فيزياء فلكية", "الفيزياء الفلكية", "فلك", "الفلك", "علم الفلك", "الكونيات", "علم الكون", "كوزمولوجي", "ئەستروفیزیا", "گەردوونناسی", "ئەستێرەناسی"],
    /* 10 */ ["mathematical physics", "computational physics", "mathematical methods", "numerical methods", "python", "programming", "فيزياء رياضية", "الفيزياء الرياضية", "طرق رياضية", "الطرق الرياضية", "فيزياء حاسوبية", "الفيزياء الحاسوبية", "برمجة", "بايثون", "كمبيوتر", "الكمبيوتر", "حاسوب", "فیزیایا بیرکاری", "کۆمپیوتەری"],
    /* 11 */ ["precalculus", "pre calculus", "basic math", "basic maths", "algebra", "trigonometry", "ما قبل التفاضل", "الجبر", "جبر", "المثلثات", "حساب المثلثات", "رياضيات اساسية", "اساسيات الرياضيات", "پێش کالکولەس"],
    /* 12 */ ["calculus", "differentiation", "integration", "derivative", "integral", "التفاضل", "تفاضل", "التكامل", "تكامل", "التفاضل والتكامل", "كالكولس", "كالكولاس", "کالکولەس"],
    /* 13 */ ["linear algebra", "matrices", "matrix", "الجبر الخطي", "جبر خطي", "المصفوفات", "مصفوفات", "جەبرا هێلی", "ماتریکس"],
    /* 14 */ ["differential equations", "ode", "pde", "المعادلات التفاضلية", "معادلات تفاضلية", "هەڤکێشەیێن دیفرێنشیال", "دیفرێنشیال"],
    /* 15 */ ["vector analysis", "tensor", "tensors", "vector calculus", "vectors", "المتجهات", "متجهات", "التحليل الاتجاهي", "تحليل المتجهات", "الموترات", "موترات", "تنسور", "التنسورات", "ڤێکتەر", "تێنسۆر"],
    /* 16 */ ["complex analysis", "complex numbers", "complex variables", "التحليل العقدي", "تحليل عقدي", "الاعداد المركبة", "الاعداد العقدية", "المتغيرات العقدية", "التحليل المركب", "شیکاریا کۆمپلێکس", "کۆمپلێکس"],
    /* 17 */ ["group theory", "groups", "symmetry", "نظرية الزمر", "الزمر", "زمر", "نظرية المجموعات", "التناظر", "تیۆریا گروپان", "گروپ"],
    /* 18 */ ["probability", "statistics", "stats", "الاحتمالات", "احتمالات", "الاحتمال", "الاحصاء", "احصاء", "ئەگەر و ئامار", "ئامار"],
    /* 19 */ ["history of science", "philosophy of science", "philosophy", "history", "تاريخ العلم", "تاريخ العلوم", "فلسفة العلم", "فلسفة العلوم", "فلسفة", "الفلسفة", "تاريخ", "فەلسەفە", "دیرۆک"],
    /* 20 */ ["wonders of quantum", "wonders", "عجائب"],
    /* 21 */ ["universe", "space", "cosmos", "black holes", "black hole", "stars", "galaxies", "الكون", "الفضاء", "فضاء", "الثقوب السوداء", "ثقب اسود", "النجوم", "المجرات", "گەردوون", "فەزا", "کونا ڕەش"],
    /* 22 */ ["beauty of mathematics", "fun math", "جمال الرياضيات", "رياضيات ممتعة", "جوانیا بیرکاریێ"],
    /* 23 */ ["biography", "biographies", "scientists", "سيرة", "سير العلماء", "السيرة", "حياة العلماء", "العلماء", "علماء", "ژیاننامە", "زانایان", "زانا"],
    /* 24 */ ["documentary", "documentaries", "video", "videos", "articles", "article", "وثائقي", "وثائقية", "وثائقيات", "افلام", "فيلم", "فيديو", "فيديوهات", "مقالات", "مقالة", "مقال", "دۆکیۆمێنتاری", "ڤیدیۆ", "گۆتار"]
  ];
  /* The word lists below are only needed once someone asks something,
     so they are prepared on the first question rather than on every page load. */
  var SUBJECTS, POP_REMAP, LEVEL_WORDS, NOTE_WORDS, CATEGORY, INTENTS, STOP, prepared = false;
  function prepare() {
    if (prepared) return;
    prepared = true;
    // also every subject's own name in all three languages
    SUBJECTS = INDEX.subjects.map(function (s, i) {
      var list = (SUBJECT_WORDS[i] || []).slice();
      if (i !== 20) {
        [s.name, W("ar", s.name), W("ku", s.name)].forEach(function (n) { list.push(n); });
      }
      return prep(list);
    });
    POP_REMAP = { 4: 20, 6: 20, 9: 21, 11: 22, 12: 22, 13: 22, 14: 22, 15: 22, 16: 22, 17: 22, 18: 22 };

    LEVEL_WORDS = {
      extreme: prep(["extreme", "graduate", "phd", "masters", "master's", "very hard", "very advanced", "متقدم جدا", "صعب جدا", "دراسات عليا", "ماجستير", "دكتوراه", "دكتوراة", "گەلەک دژوار", "خواندنا بلند"]),
      hard: prep(["hard", "harder", "hardest", "difficult", "advanced", "tough", "challenging", "صعب", "اصعب", "صعبة", "متقدم", "متقدمة", "قوي", "دژوار", "دژوارتر", "پێشکەفتی", "زەحمەت"]),
      medium: prep(["medium", "intermediate", "middle", "متوسط", "متوسطة", "ناڤنجی"]),
      easy: prep(["easy", "easier", "easiest", "simple", "سهل", "اسهل", "سهلة", "بسيط", "بسيطة", "ئاسان", "ئاسانتر", "سادە"]),
      beginner: prep(["beginner", "beginners", "from zero", "from scratch", "basics", "مبتدئ", "مبتدئين", "للمبتدئين", "المبتدئين", "من الصفر", "دەستپێک", "دەستپێکەر", "ژ سفرێ", "سەرەتا"])
    };
    NOTE_WORDS = {
      "Problem book": prep(["problems", "problem book", "exercises", "solved problems", "practice", "مسائل", "تمارين", "تمرين", "حلول", "محلولة", "ڕاهێنان", "ڕاهێنانان", "پسیار و بەرسڤ"]),
      "Lab work": prep(["lab", "laboratory", "experiments", "practical", "مختبر", "المختبر", "عملي", "تجارب", "تاقیگەه", "تاقیگەهێ"])
    };
    CATEGORY = {
      physics: prep(["physics", "فيزياء", "الفيزياء", "فیزیا", "فیزیک", "فیزیایێ"]),
      math: prep(["math", "maths", "mathematics", "رياضيات", "الرياضيات", "بیرکاری", "بیرکاریێ", "ماتماتیک"]),
      pop: prep(["pop science", "popular science", "pop", "simplified", "without math", "without maths", "no math", "مبسط", "مبسطة", "العلوم المبسطة", "علوم مبسطة", "بدون رياضيات", "بلا رياضيات", "زانستا سادە", "بێ بیرکاری"])
    };
    INTENTS = {
      greet: prep(["hi", "hello", "hey", "salam", "good morning", "good evening", "السلام", "سلام", "مرحبا", "هلا", "اهلا", "هاي", "صباح الخير", "مساء الخير", "سلاڤ", "ڕۆژباش", "رۆژباش", "شەڤباش", "چاوانی", "باشی"]),
      thanks: prep(["thanks", "thank", "thx", "شكرا", "مشكور", "تسلم", "يعطيك العافية", "سپاس", "دەستخۆش", "ممنون"]),
      download: prep(["download", "pdf", "link", "links", "read online", "get the book", "تحميل", "تنزيل", "احمل", "احمّل", "انزل", "رابط", "روابط", "لينك", "روابط الكتب", "بي دي اف", "داونلود", "داگرم", "داگرتن", "داگرتنا", "لینک", "لینکێن", "داونلۆد"]),
      levels: prep(["level", "levels", "المستويات", "مستويات", "المستوى", "مستوى", "ئاست", "ئاستێن", "ئاستان"]),
      howto: prep(["how to use", "how does the site work", "search", "language", "dark mode", "light mode", "theme", "بحث", "ابحث", "البحث", "اللغة", "لغة", "الوضع الليلي", "الوضع المظلم", "الوضع الداكن", "لێگەریان", "زمان", "تاری"]),
      count: prep(["how many", "number of books", "count", "کم", "کم کتاب", "کم عدد", "عدد", "عدد الكتب", "چەند"]),
      contact: prep(["contact", "email", "instagram", "reach you", "تواصل", "التواصل", "ايميل", "انستا", "انستغرام", "پەیوەندی", "ئیمەیل"]),
      me: prep(["who are you", "what are you", "are you ai", "are you a bot", "من انت", "شنو انت", "ما انت", "انت مين", "هل انت", "تو کی", "تو کێ", "تو چی"]),
      about: prep(["what is mobius", "about mobius", "this site", "the site", "website", "who made", "who created", "founder", "designer", "developer", "owner", "mobius", "موبيوس", "الموقع", "موقع", "عن الموقع", "من صنع", "من سوى", "من عمل", "من صمم", "المؤسس", "المصمم", "المطور", "صاحب", "ماڵپەڕ", "ماڵپەڕی", "موبیوس", "دامەزرێنەر", "دیزاینەر", "کێ چێکر"]),
      subjects: prep(["subjects", "topics", "categories", "what subjects", "all subjects", "المواد", "مواد", "الاقسام", "اقسام", "المواضيع", "مواضيع", "بابەت", "بابەتێن", "بابەتان"]),
      recommend: prep(["recommend", "suggest", "which book", "what book", "where to start", "where do i start", "where should i start", "start with", "should i read", "best book", "good book", "what to read", "first book", "انصح", "تنصح", "تنصحني", "انصحني", "نصيحة", "اقترح", "تقترح", "افضل كتاب", "احسن كتاب", "افضل", "احسن", "اي كتاب", "شنو اقرا", "ماذا اقرا", "شو اقرا", "من اين ابدا", "من وين ابدا", "منين ابدا", "وين ابدا", "ابدا", "ابدء", "اول كتاب", "پێشنیار", "باشترین", "کیژ پەرتووک", "چ پەرتووک", "دەستپێبکەم", "دەستپێ بکەم", "ژ کیڤە", "بخوینم"]),
      more: prep(["more", "others", "other", "another", "else", "غيره", "غيرها", "اخرى", "اخر", "ثاني", "كمان", "ایضا", "دی", "هێشتا"])
    };

    // words that never identify a book on their own
    STOP = {};
    ("the a an of to in on for and or is are was what which who how i me my you your do does can could would " +
     "book books about tell want need there any have has with by best good recommend please give show find " +
     "في من عن على الی الى هل ما ماذا شنو شو اريد ابی ابغی بدی کتاب کتب الکتاب الکتب لی عندکم عندک یوجد هو هی هذا هذه " +
     "ای کیف وین این مع او ممکن تعطینی اعطنی عطنی لو سمحت رجاء ارید اعرف تعرف شی شیء " +
     "د ل ژ بۆ من ئەز تو هەیە هەنە پەرتووک پەرتووکا پەرتووکێ پەرتووکەک کتێب چ چی کیژ دڤێت ئەڤ ئەو دا ب و یان")
      .split(" ").forEach(function (w) { STOP[fold(w)] = 1; });
    buildBookWords();
  }

  /* ---------------------------------------------------------
     Book index (title, author, and author names in ar/ku)
     --------------------------------------------------------- */
  var DF = {};
  function buildBookWords() {
    var info = window.MOBIUS_BOOKS || {};
    DF = {};
    INDEX.books.forEach(function (b) {
      var key = b.title + " — " + b.author;
      var e = info[key];
      var extra = "";
      if (e) ["ar", "ku"].forEach(function (l) {
        if (e[l] && e[l].author) extra += " " + e[l].author.split(/\s+/).slice(0, 2).join(" ");
      });
      var seen = {};
      b._w = tokens(b.title + " " + b.author + " " + extra).filter(function (w) {
        if (seen[w]) return false;
        seen[w] = 1;
        return true;
      });
      b._nt = tokens(b.title).length; // title words come first in _w
      b._w.forEach(function (w) { DF[w] = (DF[w] || 0) + 1; });
      b._key = key;
    });
    buildBookWords.withInfo = !!window.MOBIUS_BOOKS;
  }

  var HERE = -1;
  INDEX.subjects.forEach(function (s, i) {
    try { if (UI.samePath(new URL(url(s.href)).pathname, location.pathname)) HERE = i; } catch (e) {}
  });

  function findBooks(qt, used) {
    var hits = [];
    INDEX.books.forEach(function (b) {
      var sc = 0, strong = false, matched = 0, considered = 0;
      qt.forEach(function (q, i) {
        if (used[i] || STOP[q] || q.length < 3) return;
        considered++;
        for (var k = 0; k < b._w.length; k++) {
          var w = b._w[k];
          var ok = w === q || (q.length >= 4 && w.indexOf(q) === 0) || (strip(q).length >= 4 && w.indexOf(strip(q)) === 0);
          if (ok) {
            matched++;
            var df = DF[w] || 1;
            sc += 1 / df + (k < b._nt ? 0.3 : 0); // words of the title count a little more
            if (df <= 4) strong = true;
            break;
          }
        }
      });
      if (matched && (strong || (matched >= 2 && matched === considered))) hits.push({ b: b, sc: sc + matched });
    });
    // a book of the subject page the visitor is on comes first
    hits.forEach(function (h) { if (h.b.s === HERE) h.sc += 0.6; });
    hits.sort(function (a, b) { return b.sc - a.sc || LEVELS.indexOf(a.b.level) - LEVELS.indexOf(b.b.level); });
    return hits;
  }

  /* ---------------------------------------------------------
     Book text (book-info.js is large: loaded only when needed)
     --------------------------------------------------------- */
  function ensureInfo() {
    return UI.loadBookInfo().then(function () {
      if (prepared && window.MOBIUS_BOOKS && !buildBookWords.withInfo) buildBookWords();
    });
  }
  function bookText(b, L) {
    var e = (window.MOBIUS_BOOKS || {})[b._key];
    if (!e) return null;
    var order = L === "ku" ? ["ku", "ar", "en"] : L === "ar" ? ["ar", "en"] : ["en"];
    var out = { kind: e.kind || "book" };
    ["about", "author", "why", "who"].forEach(function (f) {
      for (var i = 0; i < order.length; i++) {
        var d = e[order[i]];
        if (d && d[f]) { out[f] = d[f]; return; }
      }
    });
    return out;
  }

  /* ---------------------------------------------------------
     Which language is the question in?
     --------------------------------------------------------- */
  var KU_WORDS = {};
  "چاوا چەند کیژ هەیە هەنە دڤێت ئەز تو بۆ ژ ئەڤ ئەو پەرتووک پەرتووکێن کتێب چیە باشە سلاڤ سپاس دەستپێبکەم بخوینم کێ چی ل د"
    .split(" ").forEach(function (w) { KU_WORDS[w] = 1; });
  var EN_WORDS = /\b(what|how|which|where|who|is|are|the|book|books|recommend|start|hi|hello|hey|thanks|any|need|want|best|for|about|tell|me|do|can|there|have|good|level)\b/i;

  function detectLang(text) {
    var cur = UI.lang();
    if (/[؀-ۿ]/.test(text)) {
      var ku = (text.match(/[ەێۆڕڵڤۊ]/g) || []).length * 2;
      var ar = 0;
      text.split(/\s+/).forEach(function (w) {
        if (KU_WORDS[w]) ku += 2;
        if (/^(ال|وال|بال)/.test(w)) ar += 1;
        if (/[ةيكى]/.test(w)) ar += 1; // Arabic-keyboard letters
        if (/[ئ]/.test(w) && /[یک]/.test(w)) ku += 1;
      });
      if (ku > ar) return "ku";
      if (ar > ku) return "ar";
      return cur === "ku" ? "ku" : "ar";
    }
    if (/[a-z]/i.test(text)) {
      if (cur === "en" || EN_WORDS.test(text)) return "en";
    }
    return cur;
  }

  /* ---------------------------------------------------------
     Understanding a question
     --------------------------------------------------------- */
  var ctx = { subject: null, wantStart: false, levels: null };

  function analyse(text) {
    var qt = tokens(text);
    var used = {};
    function take(m) { if (m) m.used.forEach(function (i) { used[i] = 1; }); return m; }

    var a = { qt: qt, intents: {}, levels: null, note: null, cat: null, subject: null, books: [] };

    // levels (check the stronger ones first: "very hard" before "hard")
    ["extreme", "hard", "medium", "easy", "beginner"].some(function (lv) {
      var m = bestMatch(qt, LEVEL_WORDS[lv]);
      if (m) {
        take(m);
        a.levels = lv === "easy" ? ["beginner", "easy"] : lv === "hard" ? ["hard", "extreme"] : [lv];
        a.levelWord = lv;
        return true;
      }
      return false;
    });
    Object.keys(NOTE_WORDS).forEach(function (n) {
      var m = bestMatch(qt, NOTE_WORDS[n], used);
      if (m && !a.note) { take(m); a.note = n; }
    });

    // subject: the longest matching phrase wins
    var best = null;
    SUBJECTS.forEach(function (phr, i) {
      var m = bestMatch(qt, phr, used);
      if (m && (!best || m.score > best.m.score)) best = { i: i, m: m };
    });
    var pop = bestMatch(qt, CATEGORY.pop, used);
    if (pop) take(pop);
    if (best) {
      take(best.m);
      a.subject = pop && POP_REMAP[best.i] !== undefined ? POP_REMAP[best.i] : best.i;
    }
    ["physics", "math"].forEach(function (c) {
      var m = bestMatch(qt, CATEGORY[c], used);
      if (m) { take(m); if (!a.cat) a.cat = c; }
    });
    if (pop && !a.cat) a.cat = "pop";
    if (pop) a.pop = true;

    Object.keys(INTENTS).forEach(function (k) {
      var m = bestMatch(qt, INTENTS[k], used);
      if (m) { take(m); a.intents[k] = true; }
    });
    if (a.levelWord === "beginner") a.intents.recommend = true;

    a.books = findBooks(qt, used);
    if (a.subject !== null && a.books.length) {
      var inSub = a.books.filter(function (h) { return h.b.s === a.subject; });
      if (inSub.length) a.books = inSub;
      else if (a.books[0].sc < 2.5) a.books = []; // a weak title hit loses to a clear subject
    }
    return a;
  }

  /* ---------------------------------------------------------
     Building answers. An answer is a list of parts:
       {t:"p", v:text}        a paragraph (supports **bold** and new lines)
       {t:"books", v:[ids]}   book cards (id = index in INDEX.books)
       {t:"subjects", v:[ids]} links to subject pages
       {t:"chips", v:[text]}  quick replies
       {t:"pick", v:[ids]}    quick replies that are subject names
       {t:"link", v:id}       "open the subject page" link
     --------------------------------------------------------- */
  function bookId(b) { return INDEX.books.indexOf(b); }
  function booksOf(s) {
    return INDEX.books.filter(function (b) { return b.s === s; })
      .sort(function (x, y) { return LEVELS.indexOf(x.level) - LEVELS.indexOf(y.level) || x.i - y.i; });
  }
  function counts() {
    var nt = 0, np = 0;
    INDEX.subjects.forEach(function (s) { if (s.section === "Pop Science") np++; else nt++; });
    return { nb: INDEX.books.length, ns: INDEX.subjects.length, nt: nt, np: np };
  }
  function subjectsIn(cat) {
    return INDEX.subjects.map(function (s, i) { return i; }).filter(function (i) {
      var s = INDEX.subjects[i];
      if (cat === "pop") return s.section === "Pop Science";
      if (cat === "math") return s.section !== "Pop Science" && /^\/math\//.test(s.href);
      return s.section !== "Pop Science" && /^\/physics\//.test(s.href);
    });
  }

  function answerSubject(L, s, a) {
    var all = booksOf(s);
    var name = subjName(L, s);
    var parts = [];
    if (a.intents.count && !a.levels && !a.note) {
      parts.push({ t: "p", v: S(L, "countSubject", { s: name, n: all.length }) });
      parts.push({ t: "books", v: all.map(bookId) });
      parts.push({ t: "link", v: s });
      return parts;
    }
    if (a.note) {
      var nb = all.filter(function (b) { return b.note === a.note; });
      var noteName = W(L, a.note);
      if (nb.length) {
        parts.push({ t: "p", v: S(L, "noteBooks", { note: noteName, s: name }) });
        parts.push({ t: "books", v: nb.map(bookId) });
      } else {
        parts.push({ t: "p", v: S(L, "noNote", { note: noteName, s: name }) });
        parts.push({ t: "books", v: all.map(bookId) });
      }
      parts.push({ t: "link", v: s });
      return parts;
    }
    if (a.levels) {
      var lb = all.filter(function (b) { return a.levels.indexOf(b.level) >= 0; });
      var lvName = levelName(L, a.levelWord === "easy" ? "easy" : a.levelWord === "hard" ? "hard" : a.levels[0]);
      if (lb.length && !(a.intents.recommend && a.levelWord === "beginner")) {
        parts.push({ t: "p", v: S(L, "atLevel", { lv: lvName, s: name }) });
        parts.push({ t: "books", v: lb.map(bookId) });
        parts.push({ t: "link", v: s });
        return parts;
      }
      if (!lb.length) {
        // nearest level
        var target = LEVELS.indexOf(a.levels[0]);
        var dist = all.map(function (b) { return Math.abs(LEVELS.indexOf(b.level) - target); });
        var min = Math.min.apply(null, dist);
        var near = all.filter(function (b, k) { return dist[k] === min; });
        parts.push({ t: "p", v: S(L, "noLevel", { lv: lvName, s: name }) });
        parts.push({ t: "books", v: near.map(bookId) });
        parts.push({ t: "link", v: s });
        return parts;
      }
    }
    if (a.intents.recommend || ctx.wantStart) {
      var first = all[0];
      var p = S(L, "startWith", { t: first.title, lv: levelName(L, first.level) });
      var info = bookText(first, L);
      if (info && info.who) p += "\n**" + S(L, "whoFor") + "** " + info.who;
      parts.push({ t: "p", v: p });
      parts.push({ t: "books", v: [bookId(first)] });
      var next = all.slice(1, 3);
      if (next.length) {
        parts.push({ t: "p", v: S(L, "thenNext") });
        parts.push({ t: "books", v: next.map(bookId) });
      }
      parts.push({ t: "link", v: s });
      return parts;
    }
    parts.push({ t: "p", v: S(L, "inSubject", { s: name, n: all.length }) });
    parts.push({ t: "books", v: all.map(bookId) });
    parts.push({ t: "link", v: s });
    return parts;
  }

  function answerBooks(L, hits) {
    var b = hits[0].b;
    var parts = [];
    var line = S(L, "bookLine", { t: b.title, a: b.author, lv: levelName(L, b.level), s: subjName(L, b.s) });
    var info = bookText(b, L);
    if (info) {
      if (info.about) line += "\n\n" + info.about;
      if (info.who) line += "\n**" + S(L, "whoFor") + "** " + info.who;
    } else {
      line += "\n" + S(L, "noInfo");
    }
    parts.push({ t: "p", v: line });
    parts.push({ t: "books", v: [bookId(b)] });
    var others = hits.slice(1, 5).map(function (h) { return bookId(h.b); });
    if (others.length) {
      parts.push({ t: "p", v: S(L, "alsoFound") });
      parts.push({ t: "books", v: others });
    }
    return parts;
  }

  function examplePicks() { return [4, 12, 0, 21, 2, 13]; }

  function respond(text) {
    prepare();
    var L = detectLang(text);
    var a = analyse(text);
    var it = a.intents;
    var parts, kind = "fallback";

    // follow-ups: "and a harder one?" keeps the last subject
    if (a.subject === null && ctx.subject !== null && !a.books.length && !a.cat &&
        (a.levels || a.note || it.more || it.recommend) && !it.download && !it.about && !it.count) {
      a.subject = ctx.subject;
    }
    // on a subject page, "recommend a book" means a book of this subject
    if (a.subject === null && HERE >= 0 && !a.books.length && !a.cat &&
        (a.levels || a.note || it.more || it.recommend) && !it.download && !it.about && !it.count) {
      a.subject = HERE;
    }
    if (a.subject === null && ctx.wantStart && !a.books.length && a.cat === null) {
      // they were asked "which subject?" and answered with something else
      ctx.wantStart = false;
    }

    if (a.books.length && (a.subject === null || a.books[0].b.s === a.subject)) {
      kind = "book";
      parts = answerBooks(L, a.books);
      ctx.subject = a.books[0].b.s;
      ctx.wantStart = false;
    } else if (a.subject !== null) {
      kind = "subject";
      parts = answerSubject(L, a.subject, a);
      ctx.subject = a.subject;
      ctx.wantStart = false;
    } else if (it.download) {
      kind = "intent"; parts = [{ t: "p", v: S(L, "download") }];
    } else if (it.levels && !it.recommend) {
      kind = "intent";
      var lines = LEVELS.map(function (lv) { return "• **" + levelName(L, lv) + "**: " + W(L, LEVEL_TAG[lv]); });
      parts = [{ t: "p", v: S(L, "levels") + "\n" + lines.join("\n") }];
    } else if (it.count) {
      kind = "intent"; parts = [{ t: "p", v: S(L, "count", counts()) }];
    } else if (it.howto) {
      kind = "intent"; parts = [{ t: "p", v: S(L, "howto") }];
    } else if (it.contact) {
      kind = "intent"; parts = [{ t: "p", v: S(L, "contact") }];
    } else if (it.me) {
      kind = "intent"; parts = [{ t: "p", v: S(L, "me") }, { t: "chips", v: S(L, "chips").slice(0, 3) }];
    } else if (a.cat && (it.recommend || (a.levels && a.levels[0] === "beginner"))) {
      if (a.cat === "pop") {
        kind = "intent";
        parts = [{ t: "p", v: S(L, "category", { name: W(L, "Pop Science") }) }, { t: "subjects", v: subjectsIn("pop") }];
      } else {
        kind = "subject";
        var s0 = a.cat === "math" ? 11 : 0;
        a.intents.recommend = true;
        parts = answerSubject(L, s0, a);
        ctx.subject = s0;
      }
    } else if (a.cat) {
      kind = "intent";
      var cname = W(L, a.cat === "math" ? "Mathematics" : a.cat === "pop" ? "Pop Science" : "Physics");
      parts = [{ t: "p", v: S(L, "category", { name: cname }) }, { t: "subjects", v: subjectsIn(a.cat) }];
    } else if (it.about) {
      kind = "intent"; parts = [{ t: "p", v: S(L, "site", counts()) }, { t: "chips", v: S(L, "chips").slice(0, 3) }];
    } else if (it.subjects) {
      kind = "intent";
      parts = [{ t: "p", v: S(L, "subjects", { n: INDEX.subjects.length }) }, { t: "subjects", v: INDEX.subjects.map(function (s, i) { return i; }) }];
    } else if (it.recommend || a.levels) {
      kind = "ask";
      ctx.wantStart = true;
      parts = [{ t: "p", v: S(L, "which") }, { t: "pick", v: INDEX.subjects.map(function (s, i) { return i; }) }];
    } else if (it.greet) {
      kind = "greet"; parts = [{ t: "p", v: S(L, "welcome") }, { t: "chips", v: S(L, "chips") }];
    } else if (it.thanks) {
      kind = "greet"; parts = [{ t: "p", v: S(L, "thanks") }];
    } else {
      parts = [{ t: "p", v: S(L, "fallback") }, { t: "pick", v: examplePicks() }];
    }
    // a follow-up only follows a subject or book answer
    if (kind !== "subject" && kind !== "book") ctx.subject = null;
    return { L: L, kind: kind, parts: parts, a: a };
  }

  /* ---------------------------------------------------------
     Optional AI (Cloudflare Worker -> Gemini)
     The page sends the question, the language code, the last few
     messages, and which books and page the question is about (as
     "Title — Author" keys and site paths). The Worker looks those
     up in its own copy of the site's data, so nothing typed here can
     change the AI's instructions or its book list.
     --------------------------------------------------------- */
  var history = []; // [{role:"user"|"model", text}]

  function askAI(text, local) {
    var a = local.a;
    var rel = [];
    if (a.books.length) rel = a.books.map(function (h) { return h.b; });
    else if (a.subject !== null) rel = booksOf(a.subject);
    else if (ctx.subject !== null) rel = booksOf(ctx.subject);
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    return fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({
        question: text,
        lang: local.L,
        history: history.slice(-8),
        books: rel.slice(0, 8).map(function (b) { return b.title + " — " + b.author; }),
        page: location.pathname
      }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      clearTimeout(timer);
      if (r.status === 451) { aiRegionOK = false; labels(); }
      if (r.status === 429) aiRestUntil = Date.now() + 60000;
      if (!r.ok) throw new Error("ai " + r.status);
      return r.json();
    }).then(function (d) {
      if (!d || !d.answer) throw new Error("empty");
      var ans = String(d.answer).trim();
      var parts = [{ t: "p", v: ans }];
      // show cards for the books the AI talks about
      var bold = (ans.match(/\*\*([^*]+)\*\*/g) || []).map(function (x) { return fold(x); });
      var mentioned = INDEX.books.filter(function (b) {
        var t = fold(b.title);
        return bold.some(function (x) { return x === t || x.indexOf(t + " ") === 0; });
      });
      // the same title can belong to two books (e.g. "Calculus"): prefer the subject being discussed
      var seenT = {};
      mentioned = mentioned.sort(function (x, y) {
        var sx = x.s === (a.subject !== null ? a.subject : ctx.subject) ? 0 : 1;
        var sy = y.s === (a.subject !== null ? a.subject : ctx.subject) ? 0 : 1;
        return sx - sy;
      }).filter(function (b) {
        var t = fold(b.title);
        if (seenT[t]) return false;
        seenT[t] = 1;
        return true;
      }).slice(0, 6);
      if (mentioned.length) parts.push({ t: "books", v: mentioned.map(bookId) });
      else if (local.kind === "subject" || local.kind === "book") {
        local.parts.forEach(function (p) { if (p.t === "books" || p.t === "link") parts.push(p); });
      }
      return { L: local.L, kind: "ai", parts: parts };
    });
  }

  function useAI(text, local) {
    if (!aiAllowed()) return false;
    if (local.kind === "greet") return false;
    var words = tokens(text).length;
    if (local.kind === "fallback" || local.kind === "ask") return true;
    return words > 6; // short, clear questions are answered right away
  }

  /* ---------------------------------------------------------
     The chat window
     --------------------------------------------------------- */
  var ICON = {
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4.5v4h4"/></svg>'
  };

  /* ---------------------------------------------------------
     The mascot: the site's ringed planet, with a face.
     It floats, blinks, looks at your finger or mouse, smiles
     when you come near, and thinks while an answer is coming.
     --------------------------------------------------------- */
  var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mascotN = 0;
  var mascots = [];

  function mascotSVG(small) {
    var id = "mob" + (++mascotN);
    // the ring's wobble repaints the whole drawing every frame, so touch screens (phones) go without it
    var wob = REDUCED || window.matchMedia("(pointer: coarse)").matches ? "" :
      '<animateTransform attributeName="transform" type="rotate" values="-14 32 40;-9 32 40;-14 32 40" dur="5s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/>';
    var ring = function (clip) {
      return '<g transform="rotate(-14 32 40)">' + wob +
        '<ellipse cx="32" cy="40" rx="29" ry="7.5" fill="none" stroke="url(#' + id + 'r)" stroke-width="3.4" clip-path="url(#' + id + clip + ')"/></g>';
    };
    var star = function (x, y, r, cls) {
      var k = r * 0.28;
      return '<path class="' + cls + '" d="M' + x + " " + (y - r) + " L" + (x + k) + " " + (y - k) + " L" + (x + r) + " " + y + " L" + (x + k) + " " + (y + k) +
        " L" + x + " " + (y + r) + " L" + (x - k) + " " + (y + k) + " L" + (x - r) + " " + y + " L" + (x - k) + " " + (y - k) + 'Z"/>';
    };
    return '<svg class="mascot' + (small ? " mascot-sm" : "") + '" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
      "<defs>" +
        '<radialGradient id="' + id + 'p" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#fff2cf"/><stop offset=".42" stop-color="#f7c35f"/><stop offset="1" stop-color="#d9862a"/></radialGradient>' +
        '<linearGradient id="' + id + 'r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b99cff"/><stop offset=".55" stop-color="#9db8ff"/><stop offset="1" stop-color="#7fd3ff"/></linearGradient>' +
        '<clipPath id="' + id + 'c"><circle cx="32" cy="32" r="17"/></clipPath>' +
        '<clipPath id="' + id + 'b"><rect x="-8" y="20" width="80" height="20"/></clipPath>' +
        '<clipPath id="' + id + 'f"><rect x="-8" y="40" width="80" height="20"/></clipPath>' +
      "</defs>" +
      (small ? "" : '<ellipse class="m-shadow" cx="32" cy="60" rx="13" ry="2.4"/>') +
      '<g class="m-body">' +
        ring("b") +
        '<circle cx="32" cy="32" r="17" fill="url(#' + id + 'p)"/>' +
        '<g clip-path="url(#' + id + 'c)" fill="none" stroke="#e08d2c" stroke-linecap="round" opacity=".32">' +
          '<path d="M12 23.5 Q32 19 52 23.5" stroke-width="2"/><path d="M12 43 Q32 47.5 52 43" stroke-width="2.4"/>' +
        "</g>" +
        '<ellipse cx="25" cy="22.5" rx="4.2" ry="2.3" fill="#fff" opacity=".55" transform="rotate(-28 25 22.5)"/>' +
        '<ellipse class="m-cheek" cx="22.2" cy="36.6" rx="2.7" ry="1.6"/>' +
        '<ellipse class="m-cheek" cx="41.8" cy="36.6" rx="2.7" ry="1.6"/>' +
        '<g class="m-look">' +
          '<g class="m-open">' +
            '<g class="m-eye"><ellipse cx="26" cy="31" rx="2.5" ry="3.3"/><circle class="m-shine" cx="26.9" cy="29.7" r=".95"/></g>' +
            '<g class="m-eye"><ellipse cx="38" cy="31" rx="2.5" ry="3.3"/><circle class="m-shine" cx="38.9" cy="29.7" r=".95"/></g>' +
          "</g>" +
          '<g class="m-happy" fill="none" stroke-width="1.9" stroke-linecap="round"><path d="M23.4 32 Q26 28.6 28.6 32"/><path d="M35.4 32 Q38 28.6 40.6 32"/></g>' +
        "</g>" +
        '<path class="m-smile" d="M29.6 36.6 Q32 39 34.4 36.6" fill="none" stroke-width="1.6" stroke-linecap="round"/>' +
        '<path class="m-grin" d="M29.2 36.2 Q32 41.6 34.8 36.2 Z"/>' +
        ring("f") +
      "</g>" +
      (small ? "" : '<g class="m-spark">' + star(54, 11, 4.2, "m-s1") + star(9, 17, 3, "m-s2") + star(57, 27, 2.2, "m-s3") + "</g>") +
      "</svg>";
  }

  function addMascot(host, small) {
    host.insertAdjacentHTML("afterbegin", mascotSVG(small));
    var svg = host.querySelector(".mascot");
    var m = { host: host, svg: svg, look: svg.querySelector(".m-look") };
    mascots.push(m);
    return m;
  }

  // eyes follow the pointer (mouse or finger)
  var lastPoint = null, lookQueued = false, idleTimer = null;
  function lookAt(x, y) {
    mascots.forEach(function (m) {
      if (!m.svg.isConnected || m.svg.getClientRects().length === 0) return;
      var r = m.svg.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height * 0.48;
      var dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var k = Math.min(1, d / 160);
      m.look.style.transform = "translate(" + (dx / d * 2.6 * k).toFixed(2) + "px," + (dy / d * 2.2 * k).toFixed(2) + "px)";
    });
  }
  function onPoint(e) {
    lastPoint = [e.clientX, e.clientY];
    if (lookQueued) return;
    lookQueued = true;
    requestAnimationFrame(function () { lookQueued = false; if (lastPoint) lookAt(lastPoint[0], lastPoint[1]); });
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { mascots.forEach(function (m) { m.look.style.transform = ""; }); }, 4000);
  }
  window.addEventListener("pointermove", onPoint, { passive: true });
  window.addEventListener("pointerdown", onPoint, { passive: true });

  // blink every few seconds (sometimes twice)
  function blink() {
    mascots.forEach(function (m) { m.svg.classList.add("is-blink"); });
    setTimeout(function () { mascots.forEach(function (m) { m.svg.classList.remove("is-blink"); }); }, 130);
  }
  (function blinkLoop() {
    setTimeout(function () {
      if (!document.hidden) {
        blink();
        if (Math.random() < 0.25) setTimeout(blink, 260);
      }
      blinkLoop();
    }, 2600 + Math.random() * 3400);
  })();

  function setMood(mood) {
    mascots.forEach(function (m) {
      m.svg.classList.toggle("is-happy", mood === "happy");
      m.svg.classList.toggle("is-thinking", mood === "thinking");
    });
  }

  var launcher, panel, log, form, input, sendBtn, titleEl, subEl, resetBtn, closeBtn;
  var messages = []; // saved for this tab: [{who:"me"|"bot", text?, L?, parts?}]
  var busy = false;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // **bold** and new lines, safely (no HTML from the text is ever used)
  function richText(parent, text) {
    String(text).split("\n").forEach(function (line, li) {
      if (li) parent.appendChild(document.createElement("br"));
      line.split(/(\*\*[^*]+\*\*)/).forEach(function (seg) {
        if (!seg) return;
        if (/^\*\*[^*]+\*\*$/.test(seg)) parent.appendChild(el("strong", "", seg.slice(2, -2)));
        else parent.appendChild(document.createTextNode(seg.replace(/\*\*/g, "")));
      });
    });
  }

  function build() {
    launcher = el("button", "chat-launch");
    launcher.type = "button";
    launcher.innerHTML = '<span class="chat-launch-label" aria-hidden="true"></span>';
    addMascot(launcher, false);
    launcher.setAttribute("aria-haspopup", "dialog");
    launcher.setAttribute("aria-expanded", "false");
    launcher.addEventListener("click", function () {
      if (!panel.hidden && !panel.classList.contains("is-closing")) { close(); return; }
      launcher.classList.add("is-bounce");
      setTimeout(function () { launcher.classList.remove("is-bounce"); open(true); }, REDUCED ? 0 : 260);
    });
    ["pointerenter", "focus"].forEach(function (ev) {
      launcher.addEventListener(ev, function () { setMood("happy"); });
    });
    ["pointerleave", "blur"].forEach(function (ev) {
      launcher.addEventListener(ev, function () { setMood(""); });
    });

    panel = el("section", "chat-panel");
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-labelledby", "chat-title");
    panel.innerHTML =
      '<header class="chat-head">' +
        '<span class="chat-orb"></span>' +
        '<div class="chat-titles"><h2 id="chat-title" class="chat-title"></h2><p class="chat-sub"></p></div>' +
        '<button type="button" class="chat-icon chat-reset">' + ICON.reset + "</button>" +
        '<button type="button" class="chat-icon chat-close">' + ICON.close + "</button>" +
      "</header>" +
      '<div class="chat-log" role="log" aria-live="polite"></div>' +
      '<div class="chat-note"></div>' +
      '<form class="chat-form">' +
        '<input class="chat-input" type="text" autocomplete="off" enterkeyhint="send" maxlength="400" />' +
        '<button type="submit" class="chat-send">' + ICON.send + "</button>" +
      "</form>";

    document.body.appendChild(panel);
    document.body.appendChild(launcher);

    addMascot(panel.querySelector(".chat-orb"), true);
    log = panel.querySelector(".chat-log");
    form = panel.querySelector(".chat-form");
    input = panel.querySelector(".chat-input");
    sendBtn = panel.querySelector(".chat-send");
    titleEl = panel.querySelector(".chat-title");
    subEl = panel.querySelector(".chat-sub");
    resetBtn = panel.querySelector(".chat-reset");
    closeBtn = panel.querySelector(".chat-close");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = input.value.trim();
      if (!q || busy) return;
      input.value = "";
      ask(q);
    });
    closeBtn.addEventListener("click", function () { close(); launcher.focus(); });
    resetBtn.addEventListener("click", function () {
      messages = []; history = [];
      ctx = { subject: null, wantStart: false, levels: null };
      save();
      renderAll();
      input.focus();
    });
    panel.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.stopPropagation(); close(); launcher.focus(); }
    });
    labels();
  }

  // the line above the input: what the AI is, where questions go, and the 18+ switch
  function renderNote() {
    var note = panel && panel.querySelector(".chat-note");
    if (!note) return;
    note.innerHTML = "";
    if (!AI_ENDPOINT || !aiRegionOK) { note.hidden = true; return; }
    note.hidden = false;
    var L = UI.lang(), on = aiAllowed();
    note.appendChild(el("span", "chat-note-text", S(L, on ? "aiOnNote" : "aiOffNote") + " "));
    var link = el("a", "chat-note-link", S(L, "privacy"));
    link.href = url("/privacy");
    note.appendChild(link);
    var btn = el("button", "chat-note-btn", S(L, on ? "aiStop" : "aiYes"));
    btn.type = "button";
    btn.addEventListener("click", function () {
      store("local", "mobius-ai-18", on ? null : "yes");
      labels();
      input.focus({ preventScroll: true });
    });
    note.appendChild(btn);
  }

  function labels() {
    var L = UI.lang();
    launcher.querySelector(".chat-launch-label").textContent = S(L, "greet");
    launcher.setAttribute("aria-label", S(L, "title"));
    titleEl.textContent = S(L, "title");
    if (aiAllowed()) titleEl.appendChild(el("span", "chat-ai", "AI"));
    renderNote();
    subEl.textContent = S(L, "sub");
    input.placeholder = S(L, "ph");
    input.setAttribute("aria-label", S(L, "ph"));
    sendBtn.setAttribute("aria-label", S(L, "send"));
    resetBtn.setAttribute("aria-label", S(L, "reset"));
    resetBtn.title = S(L, "reset");
    closeBtn.setAttribute("aria-label", S(L, "close"));
  }

  function open(focus) {
    panel.classList.remove("is-closing");
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    root.classList.add("chat-open");
    if (!log.childNodes.length) renderAll();
    log.scrollTop = log.scrollHeight;
    store("session", "mobius-chat-open", "1");
    setTimeout(function () { setMood(""); }, 1200);
    if (focus) setTimeout(function () { input.focus({ preventScroll: true }); }, 30);
    ensureInfo();
  }
  function close() {
    launcher.setAttribute("aria-expanded", "false");
    root.classList.remove("chat-open");
    store("session", "mobius-chat-open", null);
    if (REDUCED || panel.hidden) { panel.hidden = true; return; }
    // a short leaving animation (chat.css), then the panel is hidden
    panel.classList.add("is-closing");
    setTimeout(function () {
      if (!panel.classList.contains("is-closing")) return; // opened again meanwhile
      panel.classList.remove("is-closing");
      panel.hidden = true;
    }, 180);
  }

  function save() {
    store("session", "mobius-chat", JSON.stringify({ m: messages.slice(-40), h: history.slice(-12), c: ctx }));
  }
  function load() {
    try {
      var d = JSON.parse(store("session", "mobius-chat") || "null");
      if (d && d.m) { messages = d.m; history = d.h || []; ctx = d.c || ctx; }
    } catch (e) {}
  }

  function renderAll() {
    log.innerHTML = "";
    var L = UI.lang();
    renderBot({ L: L, parts: [{ t: "p", v: S(L, "welcome") }, { t: "chips", v: S(L, "chips") }] }, true);
    messages.forEach(function (m) {
      if (m.who === "me") renderMe(m.text);
      else renderBot(m);
    });
    log.scrollTop = log.scrollHeight;
  }

  function renderMe(text) {
    var row = el("div", "chat-msg chat-me");
    var b = el("div", "chat-bubble", text);
    b.dir = "auto";
    row.appendChild(b);
    log.appendChild(row);
    return row;
  }

  function renderBot(m, isWelcome) {
    var L = m.L || UI.lang();
    var row = el("div", "chat-msg chat-bot" + (isWelcome ? " chat-welcome" : ""));
    row.setAttribute("lang", L === "ku" ? "ku" : L);
    row.dir = L === "en" ? "ltr" : "rtl";
    var bubble = el("div", "chat-bubble");
    row.appendChild(bubble);
    (m.parts || []).forEach(function (p) {
      if (p.t === "p") {
        var para = el("p", "chat-p");
        richText(para, p.v);
        bubble.appendChild(para);
      } else if (p.t === "books") {
        var wrap = el("div", "chat-books");
        p.v.forEach(function (id) { var b = INDEX.books[id]; if (b) wrap.appendChild(bookCard(b, L)); });
        bubble.appendChild(wrap);
      } else if (p.t === "subjects") {
        var ul = el("div", "chat-subjects");
        p.v.forEach(function (id) {
          var s = INDEX.subjects[id];
          var a = el("a", "chat-subject");
          a.href = url(s.href);
          a.appendChild(el("span", "chat-subject-name", subjName(L, id)));
          a.appendChild(el("span", "chat-subject-count", S(L, "nBooks", { n: s.count })));
          ul.appendChild(a);
        });
        bubble.appendChild(ul);
      } else if (p.t === "link") {
        var s = INDEX.subjects[p.v];
        var a = el("a", "chat-link", S(L, "openPage", { s: subjName(L, p.v) }));
        a.href = url(s.href);
        if (samePage(s.href)) a.addEventListener("click", function (e) { e.preventDefault(); close(); window.scrollTo({ top: 0, behavior: "smooth" }); });
        bubble.appendChild(a);
      } else if (p.t === "chips" || p.t === "pick") {
        var box = el("div", "chat-chips");
        p.v.forEach(function (c) {
          var label = p.t === "pick" ? subjName(L, c) : c;
          var btn = el("button", "chat-chip", label);
          btn.type = "button";
          btn.addEventListener("click", function () { if (!busy) ask(label); });
          box.appendChild(btn);
        });
        bubble.appendChild(box);
      }
    });
    log.appendChild(row);
    return row;
  }

  function bookCard(b, L) {
    var card = el("button", "chat-book lv-" + b.level);
    card.type = "button";
    var cover = el("span", "chat-book-cover");
    if (b.cover) {
      var img = document.createElement("img");
      img.src = url(b.cover);
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("error", function () { img.remove(); cover.classList.add("is-blank"); });
      cover.appendChild(img);
    } else cover.classList.add("is-blank");
    var txt = el("span", "chat-book-text");
    var t = el("span", "chat-book-title", b.title); t.dir = "ltr";
    var au = el("span", "chat-book-author", b.author); au.dir = "ltr";
    var meta = el("span", "chat-book-meta");
    meta.appendChild(el("span", "chat-book-level", levelName(L, b.level)));
    meta.appendChild(document.createTextNode(" · " + subjName(L, b.s)));
    txt.appendChild(t); txt.appendChild(au); txt.appendChild(meta);
    card.appendChild(cover);
    card.appendChild(txt);
    card.addEventListener("click", function () { openBook(b); });
    return card;
  }

  function samePage(href) {
    try { return UI.samePath(new URL(url(href)).pathname, location.pathname); }
    catch (e) { return false; }
  }

  function showBookHere(i) {
    var all = document.querySelectorAll(".shelves .book");
    var book = all[i];
    if (!book) return false;
    var shelf = book.closest(".shelf");
    if (shelf && shelf.hidden) {
      var pill = document.querySelector(".pill-all");
      if (pill) pill.click();
    }
    book.scrollIntoView({ block: "center" });
    book.classList.add("is-found");
    setTimeout(function () { book.classList.remove("is-found"); }, 2600);
    setTimeout(function () { book.click(); }, 120);
    return true;
  }

  function openBook(b) {
    var s = INDEX.subjects[b.s];
    if (samePage(s.href)) {
      if (window.matchMedia("(max-width: 700px)").matches) close();
      showBookHere(b.i);
      return;
    }
    store("session", "mobius-chat-book", String(b.i));
    location.href = url(s.href) + "#book-" + b.i;
  }

  function typing() {
    var row = el("div", "chat-msg chat-bot chat-typing");
    var b = el("div", "chat-bubble");
    b.setAttribute("aria-label", S(UI.lang(), "typing"));
    b.innerHTML = "<span></span><span></span><span></span>";
    row.appendChild(b);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    return row;
  }

  function ask(q) {
    busy = true;
    sendBtn.disabled = true;
    messages.push({ who: "me", text: q });
    renderMe(q);
    var dots = typing();
    setMood("thinking");
    var started = Date.now();

    var needsInfo = !window.MOBIUS_BOOKS;
    var ready = needsInfo ? ensureInfo() : Promise.resolve();
    ready.then(function () {
      var local = respond(q);
      var p = useAI(q, local) ? askAI(q, local).catch(function () { return local; }) : Promise.resolve(local);
      return p.then(function (res) {
        var wait = Math.max(0, 380 - (Date.now() - started));
        setTimeout(function () {
          dots.remove();
          setMood("happy");
          setTimeout(function () { setMood(""); }, 1400);
          var m = { who: "bot", L: res.L, parts: res.parts };
          messages.push(m);
          history.push({ role: "user", text: q });
          history.push({ role: "model", text: res.parts.filter(function (x) { return x.t === "p"; }).map(function (x) { return x.v; }).join("\n").slice(0, 600) });
          var row = renderBot(m);
          // keep the start of the answer in view
          log.scrollTop = Math.max(0, row.offsetTop - log.offsetTop - 12);
          save();
          busy = false;
          sendBtn.disabled = false;
        }, wait);
      });
    }).catch(function () {
      dots.remove();
      setMood("");
      busy = false;
      sendBtn.disabled = false;
    });
  }

  /* ---------- start ---------- */
  build();
  load();
  if (store("session", "mobius-chat-hello") !== "1") {
    store("session", "mobius-chat-hello", "1");
    setTimeout(function () {
      if (!panel.hidden) return;
      launcher.classList.add("is-greet");
      setMood("happy");
      setTimeout(function () { launcher.classList.remove("is-greet"); setMood(""); }, 4200);
    }, 1600);
  }
  if (store("session", "mobius-chat-open") === "1" && window.matchMedia("(min-width: 701px)").matches) open(false);

  // arriving from a book card on another page: open that book
  var pending = store("session", "mobius-chat-book");
  if (pending !== null) {
    store("session", "mobius-chat-book", null);
    var m = location.hash.match(/^#book-(\d+)$/);
    if (m && m[1] === pending) {
      var go = function () { setTimeout(function () { showBookHere(+pending); }, 450); };
      if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
    }
  }

  document.addEventListener("mobius:lang", function () {
    labels();
    if (!panel.hidden) renderAll(); else log.innerHTML = "";
  });

  // phones: the button steps aside while you scroll down through books, and comes
  // back when you scroll up or stop (see .is-away in chat.css)
  var phone = window.matchMedia("(max-width: 700px)"), lastY = 0, backTimer = null;
  window.addEventListener("scroll", function () {
    var y = window.scrollY, dy = y - lastY;
    if (Math.abs(dy) < 8) return;
    lastY = y;
    var away = phone.matches && dy > 0 && y > 160 && panel.hidden;
    launcher.classList.toggle("is-away", away);
    clearTimeout(backTimer);
    if (away) backTimer = setTimeout(function () { launcher.classList.remove("is-away"); }, 1400);
  }, { passive: true });

  // The book text (book-info.js) is large (about half a megabyte), so it is not fetched on
  // every page: subject pages fetch it for the book panel, and elsewhere it starts loading
  // as soon as the visitor reaches for the chat, so the first answer is still quick.
  ["pointerenter", "pointerdown", "focus"].forEach(function (ev) {
    launcher.addEventListener(ev, function () { ensureInfo(); }, { once: true, passive: true });
  });
})();
