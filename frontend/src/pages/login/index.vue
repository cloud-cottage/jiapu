<template>
  <view class="container">
    <view class="card">
      <text class="logo">📖</text>
      <text class="title">家族历史数字馆</text>
      <text class="subtitle">手机号登录</text>

      <view class="form">
        <t-input
          @update:value="(v: any) => phone = v"
          :value="phone"
          type="number"
          :maxlength="11"
          placeholder="手机号"
          clearable
        />
        <view class="code-row">
          <t-input
            @update:value="(v: any) => code = v"
            :value="code"
            type="number"
            :maxlength="6"
            placeholder="验证码"
            clearable
            @enter="doLogin"
          />
          <t-button
            class="send-btn"
            size="small"
            variant="outline"
            theme="primary"
            :disabled="countdown > 0"
            @click="doSendCode"
          >
            {{ countdown > 0 ? `${countdown}s 后重发` : '获取验证码' }}
          </t-button>
        </view>
        <t-button
          theme="primary"
          size="large"
          :loading="loading"
          :disabled="loading"
          block
          @click="doLogin"
        >
          登 录
        </t-button>
      </view>

      <view v-if="error" class="error">
        <text>{{ error }}</text>
      </view>

      <view class="switch">
        <text class="switch-text" @click="goRegister">没有账号？立即注册</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { sendSmsCode, loginByPhone } from '@/business/api';
import { setAuth, authState } from '@/business/auth';

const phone = ref('');
const code = ref('');
const loading = ref(false);
const error = ref('');
const countdown = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

onLoad(() => {
  if (authState.loggedIn && authState.phone) {
    phone.value = authState.phone;
  }
});

function isValidPhone(p: string): boolean {
  return /^1\d{10}$/.test(p);
}

async function doSendCode() {
  if (countdown.value > 0) return;
  if (!isValidPhone(phone.value)) {
    error.value = '请输入正确的 11 位手机号';
    return;
  }
  error.value = '';
  try {
    const res = await sendSmsCode(phone.value);
    if (res.dev_code) {
      code.value = res.dev_code;
      uni.showToast({ title: `验证码: ${res.dev_code}`, icon: 'none' });
    } else {
      uni.showToast({ title: '验证码已发送', icon: 'success' });
    }
    countdown.value = 60;
    timer = setInterval(() => {
      countdown.value -= 1;
      if (countdown.value <= 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    }, 1000);
  } catch (e: any) {
    error.value = e.message || '发送失败';
  }
}

async function doLogin() {
  if (!isValidPhone(phone.value)) {
    error.value = '请输入正确的手机号';
    return;
  }
  if (!code.value) {
    error.value = '请输入验证码';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await loginByPhone(phone.value, code.value);
    setAuth({
      phone: res.phone,
      nickname: res.nickname,
      role: res.role,
      token: res.token,
      expiresAt: Date.now() + 7 * 24 * 3600 * 1000 - 60_000,
    });
    uni.showToast({ title: '登录成功', icon: 'success' });
    setTimeout(() => {
      const pages = getCurrentPages();
      if (pages.length > 1) {
        uni.navigateBack();
      } else {
        uni.redirectTo({ url: '/pages/index/index' });
      }
    }, 800);
  } catch (e: any) {
    error.value = e.message || '登录失败';
  } finally {
    loading.value = false;
  }
}

function goRegister() {
  uni.navigateTo({ url: '/pages/register/index' });
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: linear-gradient(160deg, #2F3A33 0%, #6D4C41 100%);
}
.card {
  width: 100%;
  max-width: 380px;
  background: #fff;
  border-radius: 16px;
  padding: 32px 24px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.2);
}
.logo { font-size: 44px; display: block; text-align: center; }
.title { font-size: 20px; font-weight: bold; color: #2F3A33; display: block; text-align: center; margin-top: 8px; }
.subtitle { font-size: 13px; color: #999; display: block; text-align: center; margin: 6px 0 20px; }
.form { display: flex; flex-direction: column; gap: 16px; }
.code-row { display: flex; gap: 10px; align-items: center; }
.code-row :deep(.t-input) { flex: 1; }
.send-btn { flex-shrink: 0; }
.error { text-align: center; color: #C62828; font-size: 13px; margin-top: 12px; }
.switch { text-align: center; margin-top: 18px; }
.switch-text { color: #4E6B57; font-size: 14px; }

/* ================= 夜间模式（html[data-theme='dark']）=================
   页底：暖棕渐变 → 更深的暖底渐变（只换色值，角度 / 停点不变）；
   表单卡：面 #232E2B、标题 #DFE9E4、副题 #A5B6AE、错误 #E0675F、协议/切换链接 #B4C2BB。
   输入框描边 = #36453F 与输入底色 #232E2B 由 td-dark-warm.css 的 --td-component-stroke /
   --td-bg-color-container 提供（t-input 不另写底色，避免出现浅色孤岛）。
   **验证码倒计时**：disabled 态默认取 --td-brand-color-disabled（brand-4 #8C7B4F，压 #232E2B 仅 ~2:1）
   ⇒ 在卡片作用域内把 --td-button-primary-outline-disabled-color 抬到 #A5B6AE，倒计时文字可读。
   主按钮（登 录）由 --td-brand-color #D9A96B + --td-text-color-anti #1B2422 自动达成暖棕+深字。
   只改颜色、零几何改动、无 filter / invert；全部 H5 条件编译 ⇒ 小程序零改动。 */
/* #ifdef H5 */
html[data-theme='dark'] .container { background: linear-gradient(160deg, #141C1A 0%, #1E2825 100%); }
html[data-theme='dark'] .card {
  background: #232E2B;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
  /* 卡片作用域内的按钮色变量（只影响本卡后代按钮）：倒计时/禁用态文字抬亮 */
  --td-button-primary-outline-disabled-color: #A5B6AE;
}
html[data-theme='dark'] .title { color: #DFE9E4; }
html[data-theme='dark'] .subtitle { color: #A5B6AE; }
html[data-theme='dark'] .error { color: #E0675F; }
html[data-theme='dark'] .switch-text { color: #B4C2BB; }
html[data-theme='dark'] .send-btn { --td-button-primary-outline-color: #D9A96B; }
/* #endif */
</style>
