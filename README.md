# Mandala

A small Expo React Native app for tracking a personal 48-day mandala practice.

## Requirements

- Node.js 22.13.x or newer for Expo SDK 56
- npm
- Expo Go on your mobile device, or a web browser for quick checks

## Create this project from scratch

```powershell

cd mobile_app

npx create-expo-app@latest mandala --template blank-typescript

cd mandala
```

## Install dependencies

```powershell
npm install

npx expo install@react-native-async-storage/async-storage
```

For browser testing, also install the web packages:

```powershell
npx expo install react-dom react-native-web @export/metro-runtime
```

## Run the app

```powershell
npx expo start
```