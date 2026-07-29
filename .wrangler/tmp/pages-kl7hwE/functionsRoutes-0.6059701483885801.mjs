import { onRequestPost as __api_chat_js_onRequestPost } from "D:\\aaaaaaaaaaaaaaaaa\\nuaa-map\\functions\\api\\chat.js"
import { onRequestGet as __api_qa_js_onRequestGet } from "D:\\aaaaaaaaaaaaaaaaa\\nuaa-map\\functions\\api\\qa.js"
import { onRequestPost as __api_qa_js_onRequestPost } from "D:\\aaaaaaaaaaaaaaaaa\\nuaa-map\\functions\\api\\qa.js"

export const routes = [
    {
      routePath: "/api/chat",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_chat_js_onRequestPost],
    },
  {
      routePath: "/api/qa",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_qa_js_onRequestGet],
    },
  {
      routePath: "/api/qa",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_qa_js_onRequestPost],
    },
  ]