/**
 * jsdom implements no layout, so anything the table measures from the viewport
 * has to be given a definite value by the test that needs it. Nothing is
 * stubbed globally: a component that silently depends on a stub here would
 * pass the suite and fail on the phone.
 */
export {};
