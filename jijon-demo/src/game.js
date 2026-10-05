(function () {
  "use strict";

  var SAVE_KEY = "jijonGanghoSaveV01";
  var TICK_HOURS = 0.25;

  var ACTIONS = {
    idle: { label: "대기", zone: "rest" },
    train: { label: "수련 중", zone: "training" },
    work: { label: "일손 중", zone: "work" },
    rest: { label: "휴식 중", zone: "rest" },
    expedition: { label: "출정 중", zone: "gate" }
  };

  var POSITIONS = {
    training: [
      { left: 18, top: 54 },
      { left: 29, top: 60 },
      { left: 39, top: 52 }
    ],
    work: [
      { left: 14, top: 82 },
      { left: 25, top: 86 },
      { left: 34, top: 80 }
    ],
    rest: [
      { left: 64, top: 57 },
      { left: 74, top: 62 },
      { left: 84, top: 55 }
    ],
    gate: [
      { left: 73, top: 82 },
      { left: 82, top: 85 },
      { left: 90, top: 80 }
    ]
  };

  function newGameState() {
    return {
      version: 1,
      day: 1,
      hour: 8,
      paused: false,
      speed: 1,
      actionAccumulator: 0,
      silver: 30,
      food: 18,
      fame: 0,
      facilities: {
        training: false,
        kitchen: false,
        clinic: false
      },
      selectedDiscipleId: null,
      dailySummary: "쇠락한 청운문의 새 하루가 시작되었습니다.",
      log: [
        { day: 1, text: "장문인이 문파의 재건을 시작했다." },
        { day: 1, text: "세 제자가 본당 앞에 모였다." }
      ],
      disciples: [
        {
          id: "mujin",
          name: "백무진",
          role: "사형 · 전열",
          description: "무력이 높고 몸으로 버티는 데 능하다. 부상을 입어도 물러서기 싫어한다.",
          color: "#9c6656",
          martial: 9,
          qi: 4,
          agility: 4,
          maxHp: 126,
          hp: 126,
          stamina: 88,
          injury: 0,
          action: "idle",
          trainingProgress: 10,
          battleExp: 0,
          trait: "강한 자존심",
          specialty: "martial",
          workType: "silver",
          skill: { name: "강격", rank: 1, xp: 15, desc: "세 번째 행동마다 강한 일격을 가한다." }
        },
        {
          id: "yeonhwa",
          name: "서연화",
          role: "연구형 · 내공",
          description: "무공의 원리를 파고드는 데 뛰어나다. 실전은 약하지만 내공 운용이 정교하다.",
          color: "#6f8ca3",
          martial: 4,
          qi: 9,
          agility: 5,
          maxHp: 108,
          hp: 108,
          stamina: 92,
          injury: 0,
          action: "idle",
          trainingProgress: 32,
          battleExp: 0,
          trait: "무공 해석",
          specialty: "qi",
          workType: "silver",
          skill: { name: "호신", rank: 1, xp: 35, desc: "세 번째 행동마다 아군 한 명에게 호신기를 펼친다." }
        },
        {
          id: "somi",
          name: "유소미",
          role: "사제 · 신법",
          description: "발이 빠르고 재능이 좋지만 실전 경험이 부족하다. 믿을 만한 동료가 있으면 안정된다.",
          color: "#76936f",
          martial: 5,
          qi: 4,
          agility: 10,
          maxHp: 102,
          hp: 102,
          stamina: 96,
          injury: 0,
          action: "idle",
          trainingProgress: 18,
          battleExp: 0,
          trait: "겁이 많음",
          specialty: "agility",
          workType: "food",
          skill: { name: "견제", rank: 1, xp: 8, desc: "세 번째 행동마다 적의 다음 행동을 늦춘다." }
        }
      ]
    };
  }

  var state = loadStoredState() || newGameState();
  if (!state.facilities) {
    state.facilities = { training: false, kitchen: false, clinic: false };
  }
  var expeditionSelection = [];
  var battle = {
    sim: null,
    eventIndex: 0,
    timer: null,
    speed: 1,
    finished: false,
    selectedIds: []
  };

  function el(id) {
    return document.getElementById(id);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  function statLabel(key) {
    return key === "martial" ? "무력" : key === "qi" ? "내공" : "신법";
  }

  function formatHour(value) {
    var hour = Math.floor(value);
    var minutes = Math.floor((value - hour) * 60);
    return String(hour).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
  }

  function getDisciple(id) {
    return state.disciples.find(function (d) { return d.id === id; });
  }

  function addLog(text) {
    state.log.unshift({ day: state.day, text: text });
    state.log = state.log.slice(0, 40);
    renderLog();
  }

  function toast(text) {
    var box = el("toast");
    box.textContent = text;
    box.classList.remove("hidden");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () {
      box.classList.add("hidden");
    }, 1600);
  }

  function saveGame(silent) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      if (!silent) toast("문파 기록을 저장했습니다.");
    } catch (error) {
      if (!silent) toast("저장할 수 없습니다.");
    }
  }

  function loadStoredState() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.disciples)) return null;
      return parsed;
    } catch (error) {
      return null;
    }
  }

  function loadGame() {
    var stored = loadStoredState();
    if (!stored) {
      toast("저장된 기록이 없습니다.");
      return;
    }
    state = stored;
    state.paused = false;
    renderAll();
    toast("저장된 문파 기록을 불러왔습니다.");
  }

  function resetGame() {
    if (!window.confirm("현재 문파 기록을 초기화할까요?")) return;
    localStorage.removeItem(SAVE_KEY);
    state = newGameState();
    expeditionSelection = [];
    renderAll();
    toast("새로운 문파 운영을 시작합니다.");
  }

  function renderResources() {
    el("silverValue").textContent = Math.floor(state.silver);
    el("foodValue").textContent = Math.floor(state.food);
    el("fameValue").textContent = Math.floor(state.fame);
    el("dayValue").textContent = state.day + "일차";
    el("timeValue").textContent = formatHour(state.hour);
    el("dailySummary").textContent = state.dailySummary;

    el("pauseBtn").textContent = state.paused ? "▶" : "Ⅱ";
    document.querySelectorAll(".speed").forEach(function (button) {
      button.classList.toggle("active", Number(button.dataset.speed) === state.speed);
    });
  }

  function renderScene() {
    var layer = el("discipleLayer");

    state.disciples.forEach(function (disciple, index) {
      var avatar = layer.querySelector('[data-disciple-avatar="' + disciple.id + '"]');
      if (!avatar) {
        avatar = document.createElement("div");
        avatar.dataset.discipleAvatar = disciple.id;
        avatar.className = "disciple-avatar";
        avatar.style.setProperty("--char-color", disciple.color);
        avatar.innerHTML =
          '<div class="shadow"></div>' +
          '<div class="body"></div>' +
          '<div class="head"></div>' +
          '<div class="hair"></div>' +
          '<div class="nameplate"></div>' +
          '<div class="action-badge"></div>';
        avatar.addEventListener("click", function () {
          selectDisciple(disciple.id);
        });
        layer.appendChild(avatar);
      }

      var zone = ACTIONS[disciple.action] ? ACTIONS[disciple.action].zone : "rest";
      var pos = POSITIONS[zone][index % POSITIONS[zone].length];

      avatar.style.left = pos.left + "%";
      avatar.style.top = pos.top + "%";
      avatar.querySelector(".nameplate").textContent = disciple.name;
      avatar.querySelector(".action-badge").textContent = ACTIONS[disciple.action].label;
      avatar.className = "disciple-avatar";
      if (disciple.action === "train") avatar.classList.add("training");
      if (disciple.action === "work") avatar.classList.add("working");
      if (disciple.action === "rest" || disciple.action === "idle") avatar.classList.add("resting");
      if (disciple.injury > 0) avatar.classList.add("injured");
      if (state.selectedDiscipleId === disciple.id) {
        avatar.style.filter = "drop-shadow(0 0 8px rgba(216,183,104,.75))";
      } else {
        avatar.style.removeProperty("filter");
      }
    });
  }

  function meter(label, value, max, kind) {
    var pct = clamp(value / max * 100, 0, 100);
    return '<div class="meter-row"><span>' + label + '</span><div class="meter ' + (kind || "") +
      '"><i style="width:' + pct + '%"></i></div><b>' + Math.round(value) + '</b></div>';
  }

  function renderDiscipleList() {
    var list = el("discipleList");
    list.innerHTML = "";

    state.disciples.forEach(function (disciple) {
      var card = document.createElement("div");
      card.className = "disciple-card" + (state.selectedDiscipleId === disciple.id ? " selected" : "");
      card.style.setProperty("--char-color", disciple.color);
      card.innerHTML =
        '<div class="disciple-card-top">' +
          '<div class="disciple-name"><span class="disciple-dot"></span><div><strong>' + disciple.name + '</strong><div class="role">' + disciple.role + '</div></div></div>' +
          '<span class="status-text">' + ACTIONS[disciple.action].label + '</span>' +
        '</div>' +
        meter("체력", disciple.hp, disciple.maxHp, "hp") +
        meter("기력", disciple.stamina, 100, "");
      card.addEventListener("click", function () {
        selectDisciple(disciple.id);
      });
      list.appendChild(card);
    });
  }

  function renderDetail() {
    var panel = el("detailPanel");
    var disciple = state.selectedDiscipleId ? getDisciple(state.selectedDiscipleId) : null;

    if (!disciple) {
      panel.innerHTML =
        '<div class="empty-detail"><span>☯</span><p>제자를 선택하면 능력과 무공,<br>현재 상태를 확인할 수 있습니다.</p></div>';
      return;
    }

    var injuryText = disciple.injury > 0 ? "부상 " + disciple.injury : "정상";
    var skillPct = clamp(disciple.skill.xp, 0, 100);
    var trainingPct = clamp(disciple.trainingProgress, 0, 100);

    panel.innerHTML =
      '<div class="detail-head">' +
        '<div><h3>' + disciple.name + '</h3><p>' + disciple.role + ' · ' + disciple.trait + '</p></div>' +
        '<span class="condition">' + injuryText + '</span>' +
      '</div>' +
      '<div class="stats-grid">' +
        '<div class="stat-box"><span>무력</span><strong>' + disciple.martial + '</strong></div>' +
        '<div class="stat-box"><span>내공</span><strong>' + disciple.qi + '</strong></div>' +
        '<div class="stat-box"><span>신법</span><strong>' + disciple.agility + '</strong></div>' +
      '</div>' +
      '<div class="skill-box">' +
        '<div class="skill-line"><strong>' + disciple.skill.name + ' · ' + disciple.skill.rank + '성</strong><span>숙련 ' + Math.floor(disciple.skill.xp) + '%</span></div>' +
        '<div class="skill-progress"><i style="width:' + skillPct + '%"></i></div>' +
        '<div style="font-size:9px;color:#aaa18f;margin-top:6px;line-height:1.45">' + disciple.skill.desc + '</div>' +
      '</div>' +
      '<div class="skill-box">' +
        '<div class="skill-line"><strong>' + statLabel(disciple.specialty) + ' 수련</strong><span>' + Math.floor(disciple.trainingProgress) + '%</span></div>' +
        '<div class="skill-progress"><i style="width:' + trainingPct + '%"></i></div>' +
      '</div>' +
      '<div class="order-label">행동 지정</div>' +
      '<div class="order-buttons">' +
        '<button data-action="train">수련</button>' +
        '<button data-action="work">일손</button>' +
        '<button data-action="rest">휴식</button>' +
      '</div>' +
      '<div style="margin-top:9px;font-size:9px;line-height:1.5;color:#8f8879">' + disciple.description + '</div>';

    panel.querySelectorAll("[data-action]").forEach(function (button) {
      button.addEventListener("click", function () {
        setDiscipleAction(disciple.id, button.dataset.action);
      });
    });
  }

  function renderLog() {
    var list = el("sectLog");
    list.innerHTML = state.log.slice(0, 12).map(function (entry) {
      return '<div class="log-entry"><b>' + entry.day + '일차</b> · ' + entry.text + '</div>';
    }).join("");
  }

  function renderFacilities() {
    var facilities = [
      { id: "training", name: "연무장", cost: 24, desc: "수련 진척 +20%" },
      { id: "kitchen", name: "취사장", cost: 20, desc: "식량 일손 효율 +25%" },
      { id: "clinic", name: "의약방", cost: 26, desc: "휴식 시 부상·체력 회복 강화" }
    ];
    var list = el("facilityList");
    if (!list) return;
    list.innerHTML = "";

    facilities.forEach(function (facility) {
      var repaired = !!state.facilities[facility.id];
      var row = document.createElement("div");
      row.className = "facility-item";
      row.innerHTML =
        '<div><strong>' + facility.name + '</strong><p>' + facility.desc + '</p></div>' +
        '<button ' + (repaired || state.silver < facility.cost ? "disabled" : "") + '>' +
        (repaired ? "복구 완료" : facility.cost + " 은전") + '</button>';
      if (!repaired) {
        row.querySelector("button").addEventListener("click", function () {
          repairFacility(facility.id, facility.name, facility.cost);
        });
      }
      list.appendChild(row);
    });

    var trainingZone = document.querySelector(".training-zone");
    var workZone = document.querySelector(".work-zone");
    var restZone = document.querySelector(".rest-zone");
    if (trainingZone) trainingZone.classList.toggle("restored", !!state.facilities.training);
    if (workZone) workZone.classList.toggle("restored", !!state.facilities.kitchen);
    if (restZone) restZone.classList.toggle("restored", !!state.facilities.clinic);
  }

  function repairFacility(id, name, cost) {
    if (state.facilities[id] || state.silver < cost) return;
    state.silver -= cost;
    state.facilities[id] = true;
    state.fame += 1;
    state.dailySummary = name + "을(를) 복구했습니다. 문파가 조금씩 모습을 되찾습니다.";
    addLog(name + " 복구 완료. 문파 명성이 1 올랐다.");
    saveGame(true);
    renderAll();
  }

  function renderAll() {
    renderResources();
    renderScene();
    renderDiscipleList();
    renderDetail();
    renderFacilities();
    renderLog();
  }

  function selectDisciple(id) {
    state.selectedDiscipleId = id;
    renderScene();
    renderDiscipleList();
    renderDetail();
  }

  function setDiscipleAction(id, action) {
    var disciple = getDisciple(id);
    if (!disciple || disciple.action === "expedition") return;
    disciple.action = action;
    state.dailySummary = disciple.name + "에게 " + ACTIONS[action].label.replace(" 중", "") + "을 지시했습니다.";
    addLog(disciple.name + " — " + ACTIONS[action].label);
    renderAll();
  }

  function increaseSpecialty(disciple) {
    disciple[disciple.specialty] += 1;
    disciple.trainingProgress -= 100;
    addLog(disciple.name + "의 " + statLabel(disciple.specialty) + "이(가) " + disciple[disciple.specialty] + "로 성장했다.");
  }

  function increaseSkill(disciple) {
    disciple.skill.rank += 1;
    disciple.skill.xp -= 100;
    addLog(disciple.name + "의 " + disciple.skill.name + "이(가) " + disciple.skill.rank + "성에 도달했다.");
  }

  function applyActionHour() {
    state.disciples.forEach(function (disciple) {
      if (disciple.action === "train") {
        if (disciple.stamina < 6) {
          disciple.action = "rest";
          addLog(disciple.name + "은(는) 기력이 바닥나 수련을 멈추고 쉬기 시작했다.");
          return;
        }
        disciple.stamina = clamp(disciple.stamina - 6, 0, 100);
        var specialtyValue = disciple[disciple.specialty];
        var trainingGain = 4 + specialtyValue * 0.3;
        if (state.facilities.training) trainingGain *= 1.2;
        disciple.trainingProgress += trainingGain;
        disciple.skill.xp += 2.5 + disciple.qi * 0.22;
        if (disciple.trainingProgress >= 100) increaseSpecialty(disciple);
        if (disciple.skill.xp >= 100) increaseSkill(disciple);
      } else if (disciple.action === "work") {
        if (disciple.stamina < 4) {
          disciple.action = "rest";
          addLog(disciple.name + "은(는) 지쳐 일을 멈추고 쉬기 시작했다.");
          return;
        }
        disciple.stamina = clamp(disciple.stamina - 4, 0, 100);
        if (disciple.workType === "food") {
          var foodGain = 1.3 + disciple.agility * 0.05;
          if (state.facilities.kitchen) foodGain *= 1.25;
          state.food += foodGain;
        } else {
          state.silver += 1 + disciple.martial * 0.07 + disciple.qi * 0.04;
        }
      } else if (disciple.action === "rest") {
        disciple.stamina = clamp(disciple.stamina + 10, 0, 100);
        disciple.injury = clamp(disciple.injury - (state.facilities.clinic ? 3 : 2), 0, 100);
        disciple.hp = clamp(disciple.hp + (state.facilities.clinic ? 14 : 10), 0, disciple.maxHp);
      } else if (disciple.action === "idle") {
        disciple.stamina = clamp(disciple.stamina + 3, 0, 100);
        disciple.hp = clamp(disciple.hp + 3, 0, disciple.maxHp);
      }
    });
  }

  function advanceClock(hours) {
    state.hour += hours;
    state.actionAccumulator += hours;

    while (state.actionAccumulator >= 1) {
      applyActionHour();
      state.actionAccumulator -= 1;
    }

    if (state.hour >= 22) {
      endDay();
      return;
    }

    renderAll();
  }

  function endDay() {
    var consumed = state.disciples.length;
    var shortage = Math.max(0, consumed - state.food);
    state.food = Math.max(0, state.food - consumed);

    if (shortage > 0) {
      state.disciples.forEach(function (disciple) {
        disciple.stamina = clamp(disciple.stamina - shortage * 8, 0, 100);
      });
      addLog("식량이 부족해 제자들의 기력이 떨어졌다.");
    }

    state.day += 1;
    state.hour = 8;
    state.actionAccumulator = 0;
    state.dailySummary = shortage > 0
      ? "식량 부족 속에서 " + state.day + "일차 아침을 맞았습니다."
      : state.day + "일차 아침. 오늘의 수련과 일손을 정할 시간입니다.";

    addLog("새 아침이 밝았다. 식량 " + consumed + "을 소비했다.");
    saveGame(true);
    renderAll();
  }

  function jumpNextDay() {
    if (battle.sim && !battle.finished) return;
    var remaining = Math.max(0, 22 - state.hour);
    var whole = Math.ceil(remaining);
    for (var i = 0; i < whole; i += 1) {
      applyActionHour();
    }
    state.hour = 22;
    endDay();
  }

  function openExpeditionModal() {
    expeditionSelection = [];
    renderExpeditionRoster();
    el("expeditionModal").classList.remove("hidden");
  }

  function closeModal(id) {
    el(id).classList.add("hidden");
  }

  function renderExpeditionRoster() {
    var roster = el("expeditionRoster");
    roster.innerHTML = "";

    state.disciples.forEach(function (disciple) {
      var option = document.createElement("div");
      var order = expeditionSelection.indexOf(disciple.id);
      option.className = "expedition-option" + (order >= 0 ? " selected" : "");
      option.innerHTML =
        '<div class="pick-order">' + (order >= 0 ? (order === 0 ? "① 전열" : "② 후열") : "선택 가능") + '</div>' +
        '<h4>' + disciple.name + '</h4>' +
        '<p>' + disciple.role + '<br>' + disciple.skill.name + ' ' + disciple.skill.rank + '성 · 기력 ' + Math.floor(disciple.stamina) + '<br>' +
        (disciple.injury > 0 ? "부상 " + disciple.injury : "현재 상태 정상") + '</p>' +
        '<div class="mini-stats"><span>무 ' + disciple.martial + '</span><span>내 ' + disciple.qi + '</span><span>신 ' + disciple.agility + '</span></div>';

      option.addEventListener("click", function () {
        toggleExpeditionDisciple(disciple.id);
      });
      roster.appendChild(option);
    });

    var front = expeditionSelection[0] ? getDisciple(expeditionSelection[0]) : null;
    var rear = expeditionSelection[1] ? getDisciple(expeditionSelection[1]) : null;
    el("frontPreview").textContent = front ? front.name : "미선택";
    el("rearPreview").textContent = rear ? rear.name : "미선택";
    el("startExpeditionBtn").disabled = expeditionSelection.length !== 2 || state.food < 2;
  }

  function toggleExpeditionDisciple(id) {
    var index = expeditionSelection.indexOf(id);
    if (index >= 0) {
      expeditionSelection.splice(index, 1);
    } else if (expeditionSelection.length < 2) {
      expeditionSelection.push(id);
    } else {
      expeditionSelection.shift();
      expeditionSelection.push(id);
    }
    renderExpeditionRoster();
  }

  function startExpedition() {
    if (expeditionSelection.length !== 2) return;
    if (state.food < 2) {
      toast("출정 보급에 식량 2가 필요합니다.");
      return;
    }

    state.food -= 2;
    battle.selectedIds = expeditionSelection.slice();
    battle.selectedIds.forEach(function (id) {
      var disciple = getDisciple(id);
      disciple.action = "expedition";
    });

    state.dailySummary = "두 제자가 산문을 지나 초급 비경으로 향합니다.";
    addLog(getDisciple(battle.selectedIds[0]).name + "과(와) " + getDisciple(battle.selectedIds[1]).name + "이(가) 비경으로 출정했다.");
    if (battle.selectedIds.indexOf("mujin") >= 0 && battle.selectedIds.indexOf("somi") >= 0) {
      addLog("유소미는 믿는 사형과 함께라 위축이 줄었다. 전투 효율이 상승한다.");
    }
    closeModal("expeditionModal");
    renderAll();

    setTimeout(function () {
      showBattle();
    }, 700);
  }

  function makeAllyActor(disciple, slot, teamIds) {
    var injuryPenalty = 1 - clamp(disciple.injury, 0, 40) * 0.012;
    var staminaFactor = 0.75 + clamp(disciple.stamina, 0, 100) * 0.0025;
    if (disciple.id === "somi" && teamIds.indexOf("mujin") >= 0) {
      staminaFactor += 0.08;
    }
    var maxHp = Math.max(55, Math.round((72 + disciple.martial * 7 + disciple.qi * 3) * injuryPenalty));

    return {
      id: disciple.id,
      name: disciple.name,
      side: "ally",
      slot: slot,
      hp: maxHp,
      maxHp: maxHp,
      damage: (5 + disciple.martial * 1.35 + disciple.qi * 0.22) * staminaFactor * injuryPenalty,
      speed: clamp(1.72 - disciple.agility * 0.055, 0.72, 1.5),
      next: slot * 0.07,
      turns: 0,
      shield: 0,
      skill: disciple.skill.name,
      skillRank: disciple.skill.rank,
      color: disciple.color
    };
  }

  function createBattleSimulation(ids) {
    var allies = ids.map(function (id, index) {
      return makeAllyActor(getDisciple(id), index, ids);
    });

    var enemies = [
      {
        id: "enemy_boss",
        name: "산채 칼잡이",
        side: "enemy",
        slot: 0,
        hp: 112,
        maxHp: 112,
        damage: 13.5,
        speed: 1.2,
        next: 0.12,
        turns: 0,
        shield: 0,
        skill: null,
        skillRank: 0,
        color: "#6b5144"
      },
      {
        id: "enemy_raider",
        name: "산적",
        side: "enemy",
        slot: 1,
        hp: 86,
        maxHp: 86,
        damage: 11,
        speed: 1.06,
        next: 0.2,
        turns: 0,
        shield: 0,
        skill: null,
        skillRank: 0,
        color: "#6b5144"
      }
    ];

    var actors = allies.concat(enemies);
    var events = [];
    var guard = 0;

    function living(side) {
      return actors.filter(function (actor) {
        return actor.side === side && actor.hp > 0;
      });
    }

    function targetFor(actor) {
      var targets = living(actor.side === "ally" ? "enemy" : "ally");
      targets.sort(function (a, b) {
        if (a.slot !== b.slot) return a.slot - b.slot;
        return a.id.localeCompare(b.id);
      });
      return targets[0];
    }

    function lowestRatioAlly() {
      var targets = living("ally");
      targets.sort(function (a, b) {
        var diff = a.hp / a.maxHp - b.hp / b.maxHp;
        if (Math.abs(diff) > 0.0001) return diff;
        return a.slot - b.slot;
      });
      return targets[0];
    }

    while (living("ally").length && living("enemy").length && guard < 100) {
      guard += 1;
      var ready = actors.filter(function (actor) { return actor.hp > 0; }).sort(function (a, b) {
        if (Math.abs(a.next - b.next) > 0.0001) return a.next - b.next;
        return a.id.localeCompare(b.id);
      });
      var actor = ready[0];
      actor.turns += 1;

      if (actor.side === "ally" && actor.turns % 3 === 0 && actor.skill === "호신") {
        var protectedAlly = lowestRatioAlly();
        protectedAlly.shield = clamp(0.42 + actor.skillRank * 0.04, 0.42, 0.66);
        events.push({
          time: actor.next,
          actorId: actor.id,
          targetId: protectedAlly.id,
          type: "shield",
          skill: "호신",
          shield: protectedAlly.shield,
          targetHp: protectedAlly.hp
        });
        actor.next += actor.speed;
        continue;
      }

      var target = targetFor(actor);
      if (!target) break;

      var damage = actor.damage;
      var skillName = null;
      var delay = 0;

      if (actor.side === "ally" && actor.turns % 3 === 0 && actor.skill === "강격") {
        skillName = "강격";
        damage = actor.damage * (1.68 + actor.skillRank * 0.1) + actor.skillRank * 2;
      } else if (actor.side === "ally" && actor.turns % 3 === 0 && actor.skill === "견제") {
        skillName = "견제";
        damage = actor.damage * (0.72 + actor.skillRank * 0.04);
        delay = 0.55 + actor.skillRank * 0.1;
      } else if (actor.side === "enemy" && actor.turns % 4 === 0) {
        skillName = "흉포한 베기";
        damage = actor.damage * 1.35;
      }

      var shielded = target.shield > 0;
      if (shielded) {
        damage *= 1 - target.shield;
        target.shield = 0;
      }

      damage = Math.max(1, Math.round(damage));
      target.hp = Math.max(0, target.hp - damage);
      if (delay > 0 && target.hp > 0) target.next += delay;

      events.push({
        time: actor.next,
        actorId: actor.id,
        targetId: target.id,
        type: "attack",
        skill: skillName,
        damage: damage,
        shielded: shielded,
        targetHp: target.hp,
        targetMaxHp: target.maxHp,
        delayed: delay
      });

      actor.next += actor.speed;
    }

    var victory = living("enemy").length === 0 && living("ally").length > 0;
    var finalHp = {};
    actors.forEach(function (actor) {
      finalHp[actor.id] = actor.hp;
    });

    return {
      actors: actors.map(function (actor) {
        return {
          id: actor.id,
          name: actor.name,
          side: actor.side,
          slot: actor.slot,
          maxHp: actor.maxHp,
          color: actor.color
        };
      }),
      events: events,
      victory: victory,
      finalHp: finalHp
    };
  }

  function showBattle() {
    document.querySelectorAll(".view").forEach(function (view) { view.classList.remove("active"); });
    el("battleView").classList.add("active");

    battle.sim = createBattleSimulation(battle.selectedIds);
    battle.eventIndex = 0;
    battle.finished = false;
    battle.speed = 1;

    document.querySelectorAll(".battle-speed").forEach(function (button) {
      button.classList.toggle("active", Number(button.dataset.battleSpeed) === 1);
    });

    renderBattleUnits();
    el("battleLog").innerHTML = "";
    el("battleStatus").textContent = "제자들이 산채 잔당과 맞붙었습니다.";
    scheduleNextBattleEvent(500);
  }

  function renderBattleUnits() {
    var allyLayer = el("allyUnits");
    var enemyLayer = el("enemyUnits");
    allyLayer.innerHTML = "";
    enemyLayer.innerHTML = "";

    battle.sim.actors.forEach(function (actor) {
      var unit = document.createElement("div");
      unit.className = "battle-unit slot-" + actor.slot + (actor.side === "enemy" ? " enemy" : "");
      unit.dataset.unitId = actor.id;
      unit.style.setProperty("--unit-color", actor.color || "#7b6d5a");
      unit.dataset.currentHp = actor.maxHp;
      unit.innerHTML =
        '<div class="fighter">' +
          '<div class="fighter-shadow"></div><div class="fighter-body"></div><div class="fighter-head"></div>' +
        '</div>' +
        '<div class="unit-info">' +
          '<div class="unit-name-line"><strong>' + actor.name + '</strong><span class="hp-text">' + actor.maxHp + ' / ' + actor.maxHp + '</span></div>' +
          '<div class="hp-bar"><i style="width:100%"></i></div>' +
        '</div>';
      (actor.side === "ally" ? allyLayer : enemyLayer).appendChild(unit);
    });
  }

  function battleUnit(id) {
    return document.querySelector('[data-unit-id="' + id + '"]');
  }

  function appendBattleLog(text) {
    var log = el("battleLog");
    var line = document.createElement("div");
    line.textContent = text;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
    while (log.children.length > 18) log.removeChild(log.firstChild);
  }

  function updateUnitHp(id, hp, maxHp) {
    var unit = battleUnit(id);
    if (!unit) return;
    var actor = battle.sim.actors.find(function (item) { return item.id === id; });
    var total = maxHp || (actor ? actor.maxHp : 1);
    var current = clamp(hp, 0, total);
    unit.dataset.currentHp = current;
    unit.querySelector(".hp-text").textContent = current + " / " + total;
    unit.querySelector(".hp-bar i").style.width = clamp(current / total * 100, 0, 100) + "%";
    if (current <= 0) unit.classList.add("down");
  }

  function spawnFloater(targetId, text, type) {
    var target = battleUnit(targetId);
    var arena = el("battleArena");
    if (!target || !arena) return;

    var targetRect = target.getBoundingClientRect();
    var arenaRect = arena.getBoundingClientRect();
    var floater = document.createElement("div");
    floater.className = "damage-floater " + (type || "");
    floater.textContent = text;
    floater.style.left = (targetRect.left - arenaRect.left + targetRect.width / 2) + "px";
    floater.style.top = (targetRect.top - arenaRect.top + 10) + "px";
    el("battleFloaters").appendChild(floater);
    setTimeout(function () { floater.remove(); }, 1050);
  }

  function scheduleNextBattleEvent(delay) {
    clearTimeout(battle.timer);
    battle.timer = setTimeout(playNextBattleEvent, delay / battle.speed);
  }

  function playNextBattleEvent() {
    if (!battle.sim || battle.finished) return;

    if (battle.eventIndex >= battle.sim.events.length) {
      finishBattle();
      return;
    }

    var event = battle.sim.events[battle.eventIndex++];
    var actor = battleUnit(event.actorId);
    var target = battleUnit(event.targetId);

    if (event.type === "shield") {
      if (actor) actor.classList.add("attack");
      if (target) target.classList.add("shielded");
      spawnFloater(event.targetId, "호신", "buff");
      appendBattleLog(getActorName(event.actorId) + " → " + getActorName(event.targetId) + "에게 호신 전개");
      el("battleStatus").textContent = getActorName(event.actorId) + "의 호신이 동료를 감쌉니다.";
      setTimeout(function () {
        if (actor) actor.classList.remove("attack");
      }, 180);
    } else {
      if (actor) actor.classList.add("attack");
      setTimeout(function () {
        if (target) target.classList.add("hit");
        updateUnitHp(event.targetId, event.targetHp, event.targetMaxHp);
        if (event.shielded && target) target.classList.remove("shielded");
        spawnFloater(event.targetId, "-" + event.damage, event.skill ? "skill" : "");
        setTimeout(function () {
          if (target) target.classList.remove("hit");
        }, 150);
      }, 90);

      var moveName = event.skill || "공격";
      appendBattleLog(getActorName(event.actorId) + "의 " + moveName + " → " + event.damage + " 피해");
      el("battleStatus").textContent = event.skill
        ? getActorName(event.actorId) + "이(가) " + event.skill + "을 펼칩니다."
        : getActorName(event.actorId) + "의 공격.";

      setTimeout(function () {
        if (actor) actor.classList.remove("attack");
      }, 180);
    }

    scheduleNextBattleEvent(520);
  }

  function getActorName(id) {
    var actor = battle.sim && battle.sim.actors.find(function (item) { return item.id === id; });
    return actor ? actor.name : id;
  }

  function skipBattle() {
    if (!battle.sim || battle.finished) return;
    clearTimeout(battle.timer);

    for (var i = battle.eventIndex; i < battle.sim.events.length; i += 1) {
      var event = battle.sim.events[i];
      if (event.type === "attack") {
        updateUnitHp(event.targetId, event.targetHp, event.targetMaxHp);
      }
    }
    battle.eventIndex = battle.sim.events.length;
    finishBattle();
  }

  function applyBattleResult() {
    var victory = battle.sim.victory;
    var notes = [];

    battle.selectedIds.forEach(function (id) {
      var disciple = getDisciple(id);
      var actor = battle.sim.actors.find(function (item) { return item.id === id; });
      var remaining = battle.sim.finalHp[id];
      var ratio = actor ? remaining / actor.maxHp : 0;

      disciple.stamina = clamp(disciple.stamina - (victory ? 20 : 28), 0, 100);
      var injuryGain = victory ? Math.max(0, Math.ceil((1 - ratio) * 7) - 1) : 8 + Math.ceil((1 - ratio) * 6);
      disciple.injury = clamp(disciple.injury + injuryGain, 0, 100);
      disciple.hp = clamp(disciple.maxHp - disciple.injury * 3, 20, disciple.maxHp);
      disciple.battleExp += victory ? 34 : 20;
      disciple.skill.xp += victory ? 12 : 7;
      disciple.action = "rest";

      if (disciple.battleExp >= 100) {
        disciple[disciple.specialty] += 1;
        disciple.battleExp -= 100;
        notes.push(disciple.name + "의 " + statLabel(disciple.specialty) + "이 실전 경험으로 상승했다.");
      }
      if (disciple.skill.xp >= 100) {
        disciple.skill.rank += 1;
        disciple.skill.xp -= 100;
        notes.push(disciple.name + "의 " + disciple.skill.name + "이 " + disciple.skill.rank + "성으로 성장했다.");
      }
    });

    var reward = victory
      ? { silver: 14, food: 4, fame: 2 }
      : { silver: -3, food: 0, fame: 0 };

    state.silver = Math.max(0, state.silver + reward.silver);
    state.food += reward.food;
    state.fame += reward.fame;
    state.hour += 2;
    if (state.hour >= 22) {
      state.hour = 21.75;
    }

    if (victory) {
      state.dailySummary = "비경에서 승리한 제자들이 전리품과 상처를 안고 돌아왔습니다.";
      addLog("초급 비경 돌파. 은전 14, 식량 4, 명성 2를 얻었다.");
    } else {
      state.dailySummary = "비경에서 패배했지만 제자들은 살아 돌아왔습니다. 회복이 필요합니다.";
      addLog("비경에서 패배했다. 은전 3을 잃고 제자들이 부상을 입었다.");
    }

    notes.forEach(addLog);
    saveGame(true);

    return { reward: reward, notes: notes };
  }

  function finishBattle() {
    if (battle.finished) return;
    battle.finished = true;
    clearTimeout(battle.timer);

    Object.keys(battle.sim.finalHp).forEach(function (id) {
      var actor = battle.sim.actors.find(function (item) { return item.id === id; });
      if (actor) updateUnitHp(id, battle.sim.finalHp[id], actor.maxHp);
    });

    var applied = applyBattleResult();
    var victory = battle.sim.victory;

    el("battleStatus").textContent = victory ? "산채 잔당을 쓰러뜨렸습니다." : "제자들이 더 버티지 못하고 물러납니다.";
    el("resultEyebrow").textContent = "초급 비경 결과";
    el("resultTitle").textContent = victory ? "승리 — 첫 전리품을 확보했다" : "패배 — 살아 돌아오는 것도 수련이다";

    var reward = applied.reward;
    var rewardSilver = reward.silver >= 0 ? "+" + reward.silver : String(reward.silver);
    var resultHtml =
      '<div class="result-grid">' +
        '<div class="result-stat"><span>은전</span><strong>' + rewardSilver + '</strong></div>' +
        '<div class="result-stat"><span>식량</span><strong>+' + reward.food + '</strong></div>' +
        '<div class="result-stat"><span>명성</span><strong>+' + reward.fame + '</strong></div>' +
      '</div>';

    var injuryLines = battle.selectedIds.map(function (id) {
      var d = getDisciple(id);
      return d.name + " — 기력 " + Math.floor(d.stamina) + " / 부상 " + d.injury + " / 실전 " + Math.floor(d.battleExp) + "%";
    });

    resultHtml += '<div class="result-note">' + injuryLines.join("<br>") +
      (applied.notes.length ? "<br><br>" + applied.notes.join("<br>") : "") + '</div>';
    el("resultBody").innerHTML = resultHtml;

    setTimeout(function () {
      el("resultModal").classList.remove("hidden");
    }, 450);
  }

  function returnToSect() {
    closeModal("resultModal");
    battle.sim = null;
    battle.eventIndex = 0;
    battle.selectedIds = [];
    document.querySelectorAll(".view").forEach(function (view) { view.classList.remove("active"); });
    el("sectView").classList.add("active");
    renderAll();
  }

  function bindEvents() {
    el("pauseBtn").addEventListener("click", function () {
      state.paused = !state.paused;
      renderResources();
    });

    document.querySelectorAll(".speed").forEach(function (button) {
      button.addEventListener("click", function () {
        state.speed = Number(button.dataset.speed);
        state.paused = false;
        renderResources();
      });
    });

    el("nextDayBtn").addEventListener("click", jumpNextDay);
    el("saveBtn").addEventListener("click", function () { saveGame(false); });
    el("loadBtn").addEventListener("click", loadGame);
    el("resetBtn").addEventListener("click", resetGame);
    el("expeditionBtn").addEventListener("click", openExpeditionModal);
    el("startExpeditionBtn").addEventListener("click", startExpedition);
    el("skipBattleBtn").addEventListener("click", skipBattle);
    el("returnSectBtn").addEventListener("click", returnToSect);

    document.querySelectorAll("[data-close-modal]").forEach(function (button) {
      button.addEventListener("click", function () {
        closeModal(button.dataset.closeModal);
      });
    });

    document.querySelectorAll(".battle-speed").forEach(function (button) {
      button.addEventListener("click", function () {
        battle.speed = Number(button.dataset.battleSpeed);
        document.querySelectorAll(".battle-speed").forEach(function (other) {
          other.classList.toggle("active", other === button);
        });
      });
    });
  }

  bindEvents();
  renderAll();

  setInterval(function () {
    if (state.paused) return;
    if (!el("sectView").classList.contains("active")) return;
    advanceClock(TICK_HOURS * state.speed);
  }, 1000);

  window.addEventListener("beforeunload", function () {
    saveGame(true);
  });
})();