import React from 'react';
import { Animated, LayoutChangeEvent, TouchableWithoutFeedback } from 'react-native';
import { PanGestureHandler, PanGestureHandlerStateChangeEvent, State } from 'react-native-gesture-handler';

import s from './Notifier.styles';
import { Notification as NotificationComponent } from './components';
import {
  DEFAULT_ANIMATION_DURATION,
  DEFAULT_COMPONENT_HEIGHT,
  DEFAULT_DURATION,
  DEFAULT_SWIPE_ENABLED,
  MAX_TRANSLATE_Y,
  MIN_TRANSLATE_Y,
  SWIPE_ANIMATION_DURATION,
  SWIPE_PIXELS_TO_CLOSE,
} from './constants';
import type { NotifierInterface, ShowNotificationParams, ShowParams, StateInterface } from './types';

export const Notifier: NotifierInterface = {
  showNotification: () => {},
  hideNotification: () => {},
  clearQueue: () => {},
  clearNotificationById: () => {},
  hideNotificationById: () => {},
};

export class NotifierRoot extends React.PureComponent<ShowNotificationParams, StateInterface> {
  private isShown: boolean;
  private isHiding: boolean;
  private hideTimer: any;
  private currentParams: ShowNotificationParams | null = null;
  private showParams: ShowParams | null;
  private callStack: Array<ShowNotificationParams>;
  private hiddenComponentValue: number;
  private readonly translateY: Animated.Value;
  private readonly translateYInterpolated: Animated.AnimatedInterpolation;
  private readonly onGestureEvent: (...args: any[]) => void;

  constructor(props: ShowNotificationParams) {
    super(props);

    this.state = {
      Component: NotificationComponent,
      swipeEnabled: DEFAULT_SWIPE_ENABLED,
      componentProps: {},
    };
    this.isShown = false;
    this.isHiding = false;
    this.hideTimer = null;
    this.showParams = null;
    this.currentParams = null;
    this.callStack = [];
    this.hiddenComponentValue = -DEFAULT_COMPONENT_HEIGHT;

    this.translateY = new Animated.Value(MIN_TRANSLATE_Y);
    this.translateYInterpolated = this.translateY.interpolate({
      inputRange: [MIN_TRANSLATE_Y, MAX_TRANSLATE_Y],
      outputRange: [MIN_TRANSLATE_Y, MAX_TRANSLATE_Y],
      extrapolate: 'clamp',
    });

    this.onGestureEvent = Animated.event(
      [
        {
          nativeEvent: { translationY: this.translateY },
        },
      ],
      { useNativeDriver: true }
    );

    this.onPress = this.onPress.bind(this);
    this.onHandlerStateChange = this.onHandlerStateChange.bind(this);
    this.onLayout = this.onLayout.bind(this);
    this.showNotification = this.showNotification.bind(this);
    this.hideNotification = this.hideNotification.bind(this);
    this.clearQueue = this.clearQueue.bind(this);
    this.hideNotificationById = this.hideNotificationById.bind(this);
    this.clearNotificationById = this.clearNotificationById.bind(this);

    Notifier.showNotification = this.showNotification;
    Notifier.hideNotification = this.hideNotification;
    Notifier.clearQueue = this.clearQueue;
    Notifier.hideNotificationById = this.hideNotificationById;
    Notifier.clearNotificationById = this.clearNotificationById;
  }

  componentWillUnmount() {
    clearTimeout(this.hideTimer);
  }

  /** Hide notification and remove it from queue if [hideDisplayedNotification] is true */
  public clearNotificationById(id: string, hideDisplayedNotification: boolean = true) {
    this.callStack = this.callStack.filter(params => params.id !== id);
    if (hideDisplayedNotification) this.hideNotificationById(id);
  }

  /** Hide notification but don't remove it from queue */
  public hideNotificationById(id: string, callback?: Animated.EndCallback) {
    if (this.isShown && !this.isHiding && this.state.id === id) {
      this.hideNotification(callback);
    }
  }

  public hideNotification(callback?: Animated.EndCallback) {
    if (!this.isShown || this.isHiding) {
      return;
    }

    Animated.timing(this.translateY, {
      toValue: this.hiddenComponentValue,
      easing: this.showParams?.hideEasing ?? this.showParams?.easing,
      duration:
        this.showParams?.hideAnimationDuration ??
        this.showParams?.animationDuration ??
        DEFAULT_ANIMATION_DURATION,
      useNativeDriver: true,
    }).start(result => {
      this.onHidden();
      callback?.(result);
    });

    this.onStartHiding();
  }

  private showCurrentLater(moveOnlyStrong: boolean) {
    if (!this.isShown || this.isHiding || this.currentParams === null) return;
    if (!moveOnlyStrong || this.currentParams.strong === true) {
      this.callStack.unshift(this.currentParams);
    }
  }

  public showNotification<ComponentType extends React.ElementType = typeof NotificationComponent>(
    functionParams: ShowNotificationParams<ComponentType>
  ) {
    const params = {
      ...this.props,
      ...functionParams,
      componentProps: { ...this.props?.componentProps, ...functionParams?.componentProps },
    };

    if (
      params.skipAlreadyShown &&
      this.isShown &&
      !this.isHiding &&
      params.id &&
      this.state.id === params.id
    )
      return;

    if (
      params.skipAlreadyInQueue &&
      params.id &&
      !!this.callStack.find(item => item.id === params.id)
    )
      return;

    if (this.isShown) {
      switch (params.queueMode) {
        case 'standby': {
          this.callStack.push(params);
          break;
        }
        case 'next': {
          this.callStack.unshift(params);
          break;
        }
        case 'immediate': {
          this.callStack.unshift(params);
          this.hideNotification();
          break;
        }
        case 'immediateMove': {
          this.showCurrentLater(false);
          this.callStack.unshift(params);
          this.hideNotification();
          break;
        }
        case 'immediateMoveOnlyStrong': {
          this.showCurrentLater(true);
          this.callStack.unshift(params);
          this.hideNotification();
          break;
        }
        default: {
          this.callStack = [params];
          this.hideNotification();
          break;
        }
      }
      return;
    }

    const {
      id,
      title,
      description,
      swipeEnabled,
      Component,
      componentProps,
      ...restParams
    } = params;

    this.setState({
      id,
      title,
      description,
      Component: Component ?? NotificationComponent,
      swipeEnabled: swipeEnabled ?? DEFAULT_SWIPE_ENABLED,
      componentProps: componentProps,
    });

    this.showParams = restParams;
    this.currentParams = params;
    this.isShown = true;

    this.setHideTimer();

    this.translateY.setValue(-DEFAULT_COMPONENT_HEIGHT);
    Animated.timing(this.translateY, {
      toValue: MAX_TRANSLATE_Y,
      easing: this.showParams?.showEasing ?? this.showParams?.easing,
      duration:
        this.showParams?.showAnimationDuration ??
        this.showParams?.animationDuration ??
        DEFAULT_ANIMATION_DURATION,
      useNativeDriver: true,
    }).start();
  }

  public clearQueue(hideDisplayedNotification?: boolean) {
    this.callStack = [];

    if (hideDisplayedNotification) {
      this.hideNotification();
    }
  }

  private setHideTimer() {
    const { duration = DEFAULT_DURATION } = this.showParams ?? {};
    clearTimeout(this.hideTimer);
    if (duration && !isNaN(duration)) {
      this.hideTimer = setTimeout(this.hideNotification, duration);
    }
  }

  private onStartHiding() {
    this.showParams?.onStartHiding?.();
    this.isHiding = true;
    clearTimeout(this.hideTimer);
  }

  private onHidden() {
    this.showParams?.onHidden?.();
    this.isShown = false;
    this.isHiding = false;
    this.showParams = null;
    this.currentParams = null;
    this.translateY.setValue(MIN_TRANSLATE_Y);

    const nextNotification = this.callStack.shift();
    if (nextNotification) {
      this.showNotification(nextNotification);
    } else {
      this.setState({ ...this.state, id: undefined, Component: NotificationComponent });
    }
  }

  private onHandlerStateChange({ nativeEvent }: PanGestureHandlerStateChangeEvent) {
    if (nativeEvent.state === State.ACTIVE) {
      clearTimeout(this.hideTimer);
    }
    if (nativeEvent.oldState !== State.ACTIVE) {
      return;
    }
    this.setHideTimer();

    const swipePixelsToClose = -(this.showParams?.swipePixelsToClose ?? SWIPE_PIXELS_TO_CLOSE);
    const isSwipedOut = nativeEvent.translationY < swipePixelsToClose;

    Animated.timing(this.translateY, {
      toValue: isSwipedOut ? this.hiddenComponentValue : MAX_TRANSLATE_Y,
      easing: this.showParams?.swipeEasing,
      duration: this.showParams?.swipeAnimationDuration ?? SWIPE_ANIMATION_DURATION,
      useNativeDriver: true,
    }).start(() => {
      if (isSwipedOut) {
        this.onHidden();
      }
    });

    if (isSwipedOut) {
      this.onStartHiding();
    }
  }

  private onPress() {
    this.showParams?.onPress?.();
    if (this.showParams?.hideOnPress !== false) {
      this.hideNotification();
    }
  }

  private onLayout({ nativeEvent }: LayoutChangeEvent) {
    const heightWithMargin = nativeEvent.layout.height + 50;
    this.hiddenComponentValue = -Math.max(heightWithMargin, DEFAULT_COMPONENT_HEIGHT);
  }

  render() {
    const { title, description, swipeEnabled, Component, componentProps } = this.state;

    return (
      <PanGestureHandler
        enabled={swipeEnabled}
        onGestureEvent={this.onGestureEvent}
        onHandlerStateChange={this.onHandlerStateChange}
      >
        <Animated.View
          style={[
            s.container,
            {
              height: -this.hiddenComponentValue,
              transform: [{ translateY: this.translateYInterpolated }],
            },
          ]}
        >
          <TouchableWithoutFeedback onPress={this.onPress} onLayout={this.onLayout}>
            <Component title={title} description={description} {...componentProps} />
          </TouchableWithoutFeedback>
        </Animated.View>
      </PanGestureHandler>
    );
  }
}
