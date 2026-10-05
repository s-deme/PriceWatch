'use client';
import { useActionState, useState } from 'react';
import { action } from '../app/actions';
const example = JSON.stringify(
  [
    {
      name: 'サンプル IEM',
      manufacturer: 'Sample',
      modelNumber: 'DEMO-001',
      categoryId: 'IEM',
      storeId: 'amazon',
      externalId: 'sample-001',
      url: 'https://www.amazon.co.jp/?item=sample-001',
      price: 4980,
      regularPrice: 6980,
      shippingPrice: 0,
      points: 0,
      currency: 'JPY',
      stockStatus: 'in_stock',
    },
  ],
  null,
  2,
);
export function ImportForm() {
  const [json, setJson] = useState(example);
  const [state, formAction, pending] = useActionState(action, {
    ok: false,
    message: '',
  });
  const [checked, setChecked] = useState('');
  return (
    <form
      action={async (data) => {
        const op = String(data.get('op'));
        await formAction(data);
        if (op === 'preview') setChecked(json);
      }}
    >
      <label>
        商品データ（JSON配列・最大100件）
        <textarea
          name="json"
          value={json}
          onChange={(e) => {
            setJson(e.target.value);
            setChecked('');
          }}
          rows={22}
          required
        />
      </label>
      <div className="detail-actions">
        <button
          className="button secondary"
          name="op"
          value="preview"
          disabled={pending}
        >
          事前検証
        </button>
        <button
          className="button"
          name="op"
          value="import"
          disabled={pending || checked !== json || !state.ok}
        >
          投入する
        </button>
      </div>
      {state.message && (
        <p
          className={state.ok ? 'success' : 'error'}
          role={state.ok ? 'status' : 'alert'}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
