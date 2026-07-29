var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/chat.js
async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;
  try {
    const body = await request.json();
    const { question, buildingId, buildingName, context: buildingCtx } = body;
    if (!question) {
      return jsonResponse({ error: "question is required" }, 400);
    }
    let answer = null;
    let sources = [];
    if (db) {
      const keywords = tokenize(question);
      if (keywords.length > 0) {
        const likeClauses = keywords.map(() => "(question LIKE ? OR answer LIKE ?)").join(" OR ");
        const params = keywords.flatMap((k) => [`%${k}%`, `%${k}%`]);
        const { results } = await db.prepare(
          `SELECT id, question, answer FROM qa_entries WHERE answer IS NOT NULL AND (${likeClauses}) LIMIT 10`
        ).bind(...params).all();
        let bestMatch = null;
        let bestScore = 0;
        for (const row of results) {
          const score = scoreMatch(keywords, row.question, row.answer || "");
          if (score > bestScore) {
            bestScore = score;
            bestMatch = row;
          }
        }
        if (bestMatch && bestScore >= 30 && bestMatch.answer) {
          answer = bestMatch.answer;
          sources = [bestMatch.id];
        }
      }
    }
    if (!answer && env.LLM_API_KEY && env.LLM_API_URL) {
      answer = await callLLM(env, question, buildingId, buildingName, buildingCtx);
    }
    if (!answer) {
      answer = "\u667A\u80FD\u95EE\u7B54\u670D\u52A1\u6682\u672A\u914D\u7F6E\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\u3002";
    }
    if (db) {
      await db.prepare(
        "INSERT INTO chat_logs (id, question, answer, building_id, building_name) VALUES (?, ?, ?, ?, ?)"
      ).bind(
        `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        question,
        answer,
        buildingId || null,
        buildingName || null
      ).run();
    }
    return jsonResponse({ answer, sources });
  } catch (err) {
    return jsonResponse({
      answer: "\u62B1\u6B49\uFF0C\u667A\u80FD\u95EE\u7B54\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528\u3002",
      error: err.message
    }, 500);
  }
}
__name(onRequestPost, "onRequestPost");
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(jsonResponse, "jsonResponse");
var STOP_WORDS = /* @__PURE__ */ new Set([
  "\u7684",
  "\u4E86",
  "\u5728",
  "\u662F",
  "\u6211",
  "\u6709",
  "\u548C",
  "\u5C31",
  "\u4E0D",
  "\u4EBA",
  "\u90FD",
  "\u4E00",
  "\u4E0A",
  "\u4E5F",
  "\u5F88",
  "\u5230",
  "\u8BF4",
  "\u8981",
  "\u53BB",
  "\u4F60",
  "\u4F1A",
  "\u7740",
  "\u6CA1\u6709",
  "\u770B",
  "\u597D",
  "\u81EA\u5DF1",
  "\u8FD9",
  "\u4ED6",
  "\u5979",
  "\u5B83",
  "\u4EEC",
  "\u90A3",
  "\u4E9B",
  "\u5417",
  "\u554A",
  "\u5462",
  "\u5427",
  "\u55EF",
  "\u54E6",
  "\u600E\u4E48",
  "\u4EC0\u4E48",
  "\u5982\u4F55",
  "\u54EA\u91CC",
  "\u54EA\u4E2A",
  "\u54EA\u4E9B",
  "\u4F55\u65F6",
  "\u591A\u5C11",
  "\u51E0",
  "\u5565",
  "\u548B",
  "\u4E3A\u5565",
  "\u4E3A\u4EC0\u4E48",
  "\u8BF7\u95EE",
  "\u8BF7"
]);
function tokenize(text) {
  const raw = text.toLowerCase().split(/[\s,.\u3002\uff0c\uff01\uff1f\u3001\uff1b\uff1a\u201c\u201d\u2018\u2019\uff08\uff09()\u3010\u3011\u300a\u300b/\\|]+/);
  const tokens = [];
  for (const token of raw) {
    if (/[\u4e00-\u9fff]/.test(token)) {
      for (const ch of token) {
        if (/[\u4e00-\u9fff]/.test(ch) && !STOP_WORDS.has(ch)) tokens.push(ch);
      }
      for (let i = 0; i < token.length - 1; i++) {
        const bigram = token.substring(i, i + 2);
        if (/[\u4e00-\u9fff]/.test(bigram[0]) && /[\u4e00-\u9fff]/.test(bigram[1]) && !STOP_WORDS.has(bigram)) {
          tokens.push(bigram);
        }
      }
      if (!STOP_WORDS.has(token)) tokens.push(token);
    } else if (token.length > 0 && !STOP_WORDS.has(token)) {
      tokens.push(token);
    }
  }
  return [...new Set(tokens)];
}
__name(tokenize, "tokenize");
function scoreMatch(keywords, questionText, answerText) {
  if (keywords.length === 0) return 0;
  const lower = `${questionText} ${answerText}`.toLowerCase();
  let matchedWeight = 0;
  let totalWeight = 0;
  for (const token of keywords) {
    const w = token.length >= 3 ? 3 : token.length === 2 ? 2 : 0.5;
    totalWeight += w;
    if (lower.includes(token)) matchedWeight += w;
  }
  return totalWeight === 0 ? 0 : matchedWeight / totalWeight * 100;
}
__name(scoreMatch, "scoreMatch");
async function callLLM(env, question, buildingId, buildingName, buildingCtx) {
  const systemPrompt = "\u4F60\u662F\u5357\u4EAC\u822A\u7A7A\u822A\u5929\u5927\u5B66\u6821\u56ED\u5730\u56FE\u667A\u80FD\u95EE\u7B54\u52A9\u624B\u3002\u8BF7\u57FA\u4E8E\u63D0\u4F9B\u7684\u4FE1\u606F\u56DE\u7B54\u95EE\u9898\uFF0C\u5982\u679C\u4E0D\u786E\u5B9A\uFF0C\u8BF7\u5982\u5B9E\u8BF4\u660E\u3002";
  let userPrompt = question;
  if (buildingName) {
    userPrompt = `\u5173\u4E8E${buildingName}\uFF1A${question}`;
  }
  if (buildingCtx) {
    userPrompt += `

\u5EFA\u7B51\u4FE1\u606F\uFF1A${buildingCtx}`;
  }
  const resp = await fetch(env.LLM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.LLM_API_KEY}`
    },
    body: JSON.stringify({
      model: env.LLM_MODEL || "deepseek-v4-pro",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 1024
    })
  });
  if (!resp.ok) throw new Error(`LLM API error: ${resp.status}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || null;
}
__name(callLLM, "callLLM");

// api/qa.js
async function onRequestGet(context) {
  const { env } = context;
  const db = env.DB;
  try {
    if (!db) {
      return jsonResponse2({ entries: [] }, 200);
    }
    const { results } = await db.prepare(
      "SELECT id, question, answer, status, created_at FROM qa_entries ORDER BY created_at DESC"
    ).all();
    const entries = results.map((row) => ({
      id: row.id,
      question: row.question,
      answer: row.answer || void 0,
      status: row.status || void 0,
      createdAt: row.created_at
    }));
    return jsonResponse2({ entries }, 200);
  } catch (err) {
    return jsonResponse2({ entries: [], error: err.message }, 500);
  }
}
__name(onRequestGet, "onRequestGet");
async function onRequestPost2(context) {
  const { request, env } = context;
  const db = env.DB;
  try {
    const body = await request.json();
    const { question, answer, status } = body;
    if (!question) {
      return jsonResponse2({ error: "question is required" }, 400);
    }
    if (!db) {
      return jsonResponse2({ error: "database not configured" }, 503);
    }
    const id = `qa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    await db.prepare(
      "INSERT INTO qa_entries (id, question, answer, status, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(
      id,
      question,
      answer || null,
      status || "pending",
      now
    ).run();
    return jsonResponse2({
      entry: {
        id,
        question,
        answer: answer || void 0,
        status: status || "pending",
        createdAt: now
      }
    }, 201);
  } catch (err) {
    return jsonResponse2({ error: err.message }, 500);
  }
}
__name(onRequestPost2, "onRequestPost");
function jsonResponse2(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(jsonResponse2, "jsonResponse");

// ../.wrangler/tmp/pages-kl7hwE/functionsRoutes-0.6059701483885801.mjs
var routes = [
  {
    routePath: "/api/chat",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/qa",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/qa",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  }
];

// C:/Users/清理一下吧/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// C:/Users/清理一下吧/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
